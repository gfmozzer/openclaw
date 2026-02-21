---
type: doc
name: development-workflow
description: Day-to-day engineering processes, branching, and contribution guidelines
category: workflow
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Development Workflow

## Prerequisites

- Node 22+
- pnpm (primary package manager)
- Docker (for local PostgreSQL + pgvector)

## Getting Started

```bash
pnpm install
docker compose -f docker-compose.postgres-local.yml up -d
npx prisma migrate dev --config prisma.config.ts
pnpm build
pnpm test
```

## Fork Workflow

This is a fork of OpenClaw. The upstream sync strategy is documented in `.agent/workflows/update_clawdbot.md`:
- Rebase from upstream `main`
- Resolve conflicts (mainly in modified gateway files)
- Re-run `pnpm build && pnpm test` after sync

## Multi-Agent Development

This codebase supports multiple AI agents working in parallel. Key rules:
- Do NOT create/drop `git stash` entries unless explicitly requested
- Do NOT switch branches unless explicitly requested
- Do NOT create/modify `git worktree` checkouts unless explicitly requested
- When you see unrecognized files, keep going — focus on your changes
- Scope commits to your changes only (unless told to "commit all")

## Enterprise Feature Flags

New enterprise features are gated by environment variables:
- `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal` — enables Temporal scheduling
- `OPENCLAW_SKILL_ADAPTER_MODE=remote` — enables remote skill execution
- `OPENCLAW_REDIS_URL` — enables distributed adapters
- `DATABASE_URL` — enables PostgreSQL persistence

Default behavior (no env vars) falls back to in-memory/local adapters for full backward compatibility.

## Adding New Contracts

When adding a new stateless contract:
1. Create the port interface in `src/gateway/stateless/contracts/`
2. Export it from `src/gateway/stateless/contracts/index.ts`
3. Create an in-memory adapter in `src/gateway/stateless/adapters/in-memory/`
4. Wire it in `src/gateway/stateless/runtime.ts`
5. Inject it via `src/gateway/server-methods/types.ts` (GatewayRequestContext)
6. Initialize it in `src/gateway/server.impl.ts`
7. Add tests

## Adding New RPC Methods

1. Create handler in `src/gateway/server-methods/`
2. Register in `src/gateway/server-methods-list.ts`
3. Add routing in `src/gateway/server-methods.ts`
4. Set scope in `src/gateway/method-scopes.ts`
5. Add tests
