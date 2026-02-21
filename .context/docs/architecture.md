---
type: doc
name: architecture
description: System architecture, layers, patterns, and design decisions
category: architecture
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Architecture

## Original (As-Is) — Single Node

The upstream OpenClaw runs as a single Node.js process:
- Gateway (`src/gateway/`) is the control plane — handles RPC, auth, channel routing
- Agent runtime ("Pi") lives in `src/agents/pi-embedded-runner/` — runs LLM inference inline
- Sessions/memory stored on local filesystem (`~/.openclaw/`)
- Cron/scheduling via in-process `CronService` (`src/cron/`)
- All state is local: no shared database, no distributed locks

## Target (To-Be) — Enterprise Multi-Tenant

```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway (NestJS)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Auth/RBAC│ │ Tenant   │ │ Scheduler│ │ Skill/Tool │ │
│  │ Service  │ │ Resolver │ │ Bridge   │ │ Bus        │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐
  │ PostgreSQL │  │   Redis     │  │ S3/MinIO│
  │ + pgvector │  │ (pub/sub,   │  │ (docs,  │
  │ (tenants,  │  │  idempot.,  │  │  per-   │
  │  sessions, │  │  locks)     │  │  tenant)│
  │  swarm,    │  └─────────────┘  └─────────┘
  │  RBAC)     │
  └────────────┘         ┌──────────────┐
                         │  Temporal.io  │
                         │  (durable     │
                         │   scheduling) │
                         └──────────────┘
```

## Stateless Contracts Layer

All state access is abstracted via port interfaces in `src/gateway/stateless/contracts/`:

| Contract | Purpose | Adapters |
|----------|---------|----------|
| `SessionStateStore` | Session read/write | in-memory |
| `MemoryStore` | Long-term memory CRUD | in-memory |
| `IdempotencyStore` | Request deduplication | in-memory, Redis |
| `MessageBus` | Pub/sub between services | in-memory, Redis |
| `RuntimeWorkerProtocol` | Gateway ↔ worker communication | in-memory |
| `SchedulerOrchestrator` | Durable job scheduling | in-memory, Temporal HTTP |
| `SkillLoader` | Load skill definitions | node workspace |
| `ToolBusDispatcher` | Remote skill execution | HTTP (n8n/MCP) |
| `SwarmDirectoryStore` | Agent team topology | in-memory |
| `EnterpriseOrchestration` | Identity/role/scope types | (type-only contract) |

## Composition Root

`src/gateway/stateless/runtime.ts` is the composition root that wires adapters based on environment:
- Default: in-memory adapters (local dev, single-node)
- `OPENCLAW_REDIS_URL` set: Redis adapters for idempotency + message bus
- `OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT` set: Temporal scheduler adapter
- `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`: disables local cron motor

## Multi-Tenancy Model

- Tenant resolved from channel payload (phone number, user ID, account ID)
- `TenantContext` injected into every service call via `MsgContext`
- S3 paths partitioned by tenant: `s3://{bucket}/{tenantId}/...`
- RAG queries filtered by tenant guard (cross-tenant blocked)
- PostgreSQL RLS enforced at database level (pending app-level `SET app.tenant_id`)

## Authorization Model (RBAC/ABAC)

Central `EnterpriseAuthorizationService` in `src/gateway/stateless/enterprise-authorization.ts`:
- Deny-by-default
- Identity → Role → Scope → Action matrix
- Roles: `operator.admin`, `operator.read`, `agent.supervisor`, `agent.worker`
- Enforced on: scheduling, swarm management, BYOK override, skill execution
- Standard error codes: `UNAUTHORIZED_REQUESTER`, `FORBIDDEN_SCOPE`, `CROSS_TENANT_FORBIDDEN`

## Swarm Architecture

- `SwarmDirectoryStore` manages supervisor/worker team topology
- Supervisors can schedule for self + their team workers
- Workers can only schedule for self
- CRUD via RPC: `swarm.team.upsert`, `swarm.team.get`, `swarm.team.list`, `swarm.team.delete`

## Database (PostgreSQL + Prisma)

Schema at `prisma/schema.prisma` with 17 models:
- `Tenant`, `User`, `Role`, `Scope` — identity and authorization
- `Agent`, `AgentSkill` — agent definitions
- `SwarmTeam`, `SwarmMembership` — team topology
- `Session`, `MemoryInteraction` — session and memory state
- `Embedding` — pgvector for RAG
- `TemporalJobTracker` — async job tracking
- `ProviderOverride` — BYOK per tenant
- `AuditEvent` — security audit trail
- `IdempotencyRecord` — distributed deduplication

Row Level Security enabled via migration `20260221205000_enable_tenant_rls`.

## Key ADR Decisions

1. **Contract-first**: all state access via port interfaces before any adapter implementation
2. **Deny-by-default**: authorization service blocks everything unless explicitly allowed
3. **Mandatory correlationId**: every async operation traceable end-to-end
4. **Hard tenant isolation**: RLS + application-level guards + RAG filters
5. **Explicit swarm directory**: team topology stored, not inferred
