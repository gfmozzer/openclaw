---
type: doc
name: security
description: Security policies, authentication, secrets management, and compliance requirements
category: security
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Security & Compliance

## Authorization Model

### Central Authorization Service
`src/gateway/stateless/enterprise-authorization.ts`

- **Deny-by-default**: all actions blocked unless explicitly allowed
- Matrix: `Identity → Role → Scope → Action`
- Enforced at gateway RPC layer before any business logic

### Roles
| Role | Capabilities |
|------|-------------|
| `operator.admin` | Full access: BYOK override, swarm management, scheduling for any agent |
| `operator.read` | Read-only: metrics, status, portal contract |
| `agent.supervisor` | Schedule for self + team workers, manage team |
| `agent.worker` | Schedule for self only |

### Standard Error Codes
- `UNAUTHORIZED_REQUESTER` — identity not recognized
- `FORBIDDEN_SCOPE` — role lacks required scope
- `CROSS_TENANT_FORBIDDEN` — attempted cross-tenant access
- `WORKFLOW_CONTEXT_MISSING` — required correlation context absent

## Tenant Isolation

### Application Layer
- `TenantResolver` extracts tenant from channel payload (phone, userId, accountId)
- `TenantContext` injected into every service call
- `RagTenantGuard` blocks cross-tenant vector queries
- `S3Partition` enforces per-tenant object paths

### Database Layer (PostgreSQL)
- Row Level Security (RLS) enabled on all tenant-scoped tables
- `public.current_tenant_id()` function reads `app.tenant_id` session variable
- Policies: `SELECT/INSERT/UPDATE/DELETE WHERE tenant_id = current_tenant_id()`
- **Gap**: app-level `SET app.tenant_id` per request not yet wired

### Scheduling Isolation
- Supervisor/worker policy: `SchedulerPolicy.canSchedule(caller, target, tenant, team)`
- Workers cannot schedule for other agents
- Supervisors can only schedule for workers in their own team and tenant
- Team membership verified via `SwarmDirectoryStore`

## BYOK (Bring Your Own Key) Security

- Per-request API key override via `chat.send` override parameter
- Requires `operator.admin` scope (anti-escalation guardrail)
- `runtimeApiKey` propagated through agent runner chain
- **Gap**: no envelope encryption — keys passed in plaintext
- **Gap**: secret redaction in logs not fully implemented

## Observability & Audit

### Metrics (`src/gateway/runtime-metrics.ts`)
- `auth_denied_total` — authorization denials
- `schedule_requests_total` — scheduling attempts
- `schedule_denied_total` — scheduling denials
- `chat_audio_requests_total`, `chat_dashboard_responses_total`
- `chat_tool_authorization_denied_total`
- `chat_async_resume_total`, `chat_async_resume_failures_total`

### Alerts (`src/gateway/server-maintenance.ts`)
- Deny spike detection
- Scheduler deny spike detection
- Resume failure spike detection
- Idempotency failure detection

### Audit Trail
- `AuditEvent` model in PostgreSQL schema
- `correlationId` mandatory on all async operations
- Scheduling decisions logged with caller/target/tenant/result

## Security Checklist

- [x] Deny-by-default authorization
- [x] Tenant isolation at application layer
- [x] RLS policies in PostgreSQL
- [x] BYOK requires admin scope
- [x] Cross-tenant scheduling blocked
- [x] Metrics for security events
- [x] Alert thresholds for anomalies
- [ ] App-level `SET app.tenant_id` per request
- [ ] BYOK envelope encryption
- [ ] Secret redaction in structured logs
- [ ] Cross-tenant E2E integration tests
- [ ] Penetration testing / threat model
