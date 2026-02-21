---
type: doc
name: tooling
description: Scripts, IDE settings, automation, and developer productivity tips
category: tooling
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Tooling & Productivity

## Environment Variables (Enterprise Fork)

### Core Infrastructure
| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection (pooled, Prisma) | — |
| `DIRECT_URL` | PostgreSQL direct connection (migrations) | — |
| `OPENCLAW_REDIS_URL` | Redis for idempotency + message bus | — (in-memory fallback) |
| `OPENCLAW_REDIS_PREFIX` | Redis key prefix for namespace isolation | `openclaw:` |
| `OPENCLAW_REDIS_TLS` | Enable TLS for Redis | `false` |

### Temporal Scheduling
| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENCLAW_CRON_ORCHESTRATION_MODE` | `local` or `temporal` | `local` |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT` | Temporal HTTP bridge URL | — |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_AUTH_TOKEN` | Temporal auth token | — |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_TIMEOUT_MS` | Temporal request timeout | `10000` |
| `OPENCLAW_TEMPORAL_TEAM_MAP_JSON` | JSON map of supervisor → workers per tenant | — |

### Skill / Tool Bus
| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENCLAW_SKILL_ADAPTER_MODE` | `local` or `remote` | `local` |
| `OPENCLAW_SKILL_TOOLBUS_ENDPOINT` | Remote tool execution URL | — |
| `OPENCLAW_SKILL_TOOLBUS_AUTH_TOKEN` | Tool bus auth token | — |
| `OPENCLAW_SKILL_TOOLBUS_TIMEOUT_MS` | Tool bus request timeout | — |
| `OPENCLAW_SKILL_TOOLBUS_KIND` | Tool bus type identifier | — |

## Local PostgreSQL Setup

```bash
# Start local Postgres with pgvector
docker compose -f docker-compose.postgres-local.yml up -d

# Run Prisma migrations
npx prisma migrate dev --config prisma.config.ts

# Generate Prisma client
npx prisma generate --config prisma.config.ts
```

## Key Scripts

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run all Vitest tests |
| `pnpm build` | Type-check and build |
| `pnpm tsgo` | TypeScript checking only |
| `pnpm check` | Lint + format check |
| `pnpm format:fix` | Auto-fix formatting |
| `scripts/committer "<msg>" <files>` | Scoped git commit |

## Workflow Files

All enterprise transformation plans and outputs are in `.agent/workflows/`:
- Plan files: `NN-name.md`
- Output files: `NN-name.output.md`
- Handoff docs: `14-runbook-deploy-swarm.md`, `14-env-guide-enterprise.md`, `14-backend-frontend-contract.md`
