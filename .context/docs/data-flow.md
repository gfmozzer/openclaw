---
type: doc
name: data-flow
description: How data moves through the system and external integrations
category: data-flow
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Data Flow & Integrations

## Inbound Message Flow (WhatsApp/Telegram)

```
Channel (WhatsApp/Telegram)
  │
  ▼
Inbound Handler (process-message.ts / bot-message-context.ts)
  │ ← TenantResolver resolves tenantId from phone/userId
  │
  ▼
MsgContext enriched with TenantId, TenantUserId, TenantPhoneNumber
  │
  ▼
Routing (src/routing/) → Agent Selection
  │
  ▼
Agent Runtime (src/agents/pi-embedded-runner/)
  │ ← BYOK: runtimeApiKey override if present
  │ ← Model override if present
  │
  ▼
LLM Provider (Anthropic/OpenAI/etc.)
  │
  ▼
Response → Outbound (src/infra/outbound/) → Channel
```

## Scheduling Flow (Temporal Mode)

```
Client (API/n8n/channel command)
  │
  ▼
Gateway RPC: cron.add
  │ ← resolveCronOrchestrationMode() → "temporal" or "local"
  │ ← SchedulerPolicy.canSchedule(caller, target, tenant, team)
  │     → DENY: 403 + SCHEDULE_FORBIDDEN / TARGET_NOT_IN_TEAM / CROSS_TENANT_FORBIDDEN
  │
  ▼ (temporal mode)
SchedulerOrchestrator.registerWorkflow(...)
  │ ← TemporalSchedulerOrchestrator → HTTP POST to Temporal cluster
  │
  ▼
Temporal Workflow executes at scheduled time
  │
  ▼
Callback → cron.callback → session resume with correlationId
```

## BYOK Override Flow

```
chat.send({ ..., override: { provider, model, apiKey, systemPrompt } })
  │
  ▼
Authorization check: caller must have operator.admin scope for BYOK
  │
  ▼
Override propagated through:
  auto-reply/types.ts → get-reply.ts → get-reply-run.ts
    → agent-runner-utils.ts → agent-runner-execution.ts
      → pi-embedded-runner/run.ts
  │
  ▼
runtimeApiKey used for LLM authentication (source: "request-override")
```

## Skill/Tool Remote Execution Flow

```
Agent requests tool execution
  │ ← resolveSkillAdapterMode() → "local" or "remote"
  │
  ▼ (remote mode)
ToolBusDispatcher.dispatch(...)
  │ ← HttpToolBusDispatcher → HTTP POST to external endpoint
  │   (n8n webhook, MCP server, custom API)
  │   with auth token + timeout
  │
  ▼
External tool response → Agent continues
```

## Swarm Directory Flow

```
Admin: swarm.team.upsert({ tenantId, teamId, supervisorAgentId, workerAgentIds })
  │
  ▼
SwarmDirectoryStore.upsert(...)
  │
  ▼
Scheduling: supervisor calls cron.add with targetAgentId
  │ ← Policy checks team membership via SwarmDirectoryStore
  │
  ▼
Worker receives scheduled task (only if in same team + tenant)
```

## External Integrations

| Integration | Purpose | Env Vars |
|-------------|---------|----------|
| Redis | Idempotency, message bus pub/sub | `OPENCLAW_REDIS_URL`, `OPENCLAW_REDIS_PREFIX`, `OPENCLAW_REDIS_TLS` |
| Temporal | Durable scheduling, async resume | `OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT`, `_AUTH_TOKEN`, `_TIMEOUT_MS` |
| S3/MinIO | Per-tenant document storage | (configured via existing S3 config) |
| PostgreSQL | Multi-tenant persistence, pgvector | `DATABASE_URL`, `DIRECT_URL` |
| n8n/MCP | Remote skill execution | `OPENCLAW_SKILL_TOOLBUS_ENDPOINT`, `_AUTH_TOKEN`, `_KIND` |
