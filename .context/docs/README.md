# Documentation Index

Welcome to the repository knowledge base. This is a fork of OpenClaw transformed into an enterprise multi-tenant agent platform. Start with the project overview, then dive into specific guides.

## Core Guides (all filled)
- [Project Overview](./project-overview.md) — fork purpose, workflow summary, known gaps
- [Architecture Notes](./architecture.md) — stateless contracts, multi-tenancy, RBAC, swarm, database
- [Development Workflow](./development-workflow.md) — setup, fork sync, multi-agent dev, adding contracts/RPCs
- [Testing Strategy](./testing-strategy.md) — enterprise test suite (22+ tests), test gaps
- [Glossary & Domain Concepts](./glossary.md) — enterprise terms, error codes, domain entities
- [Data Flow & Integrations](./data-flow.md) — message flow, scheduling, BYOK, skill/tool bus, swarm
- [Security & Compliance Notes](./security.md) — RBAC/ABAC, tenant isolation, RLS, audit, security checklist
- [Tooling & Productivity Guide](./tooling.md) — env vars, local Postgres setup, key scripts
- [Swarm Worker Quickstart](./swarm-worker-quickstart.md) — montar time supervisor/worker e validar politica
- [FAQ Enterprise Ops](./faq-enterprise-ops.md) — token/modelo/canais/scheduler/swarm

## Enterprise Workflows
All transformation workflows are in `.agent/workflows/` (01–16).
See [Project Overview](./project-overview.md) for status of each.

## Enterprise Plans
- [Enterprise Gap Closure](../plans/enterprise-gap-closure.md) — PREVC phases with task statuses
- [Temporal Scheduling Policy](../plans/temporal-supervisor-worker-scheduling.md) — supervisor/worker policy

## Repository Snapshot
- `AGENTS.md/`
- `appcast.xml/`
- `apps/`
- `assets/`
- `CHANGELOG.md/`
- `CLAUDE.md/`
- `CONTRIBUTING.md/`
- `docker-compose.yml/`
- `docker-setup.sh/`
- `Dockerfile/`
- `Dockerfile.sandbox/`
- `Dockerfile.sandbox-browser/`
- `Dockerfile.sandbox-common/`
- `docs/` — Living documentation produced by this tool.
- `docs.acp.md/`
- `extensions/`
- `fly.private.toml/`
- `fly.toml/`
- `git-hooks/`
- `LICENSE/`
- `openclaw.mjs/`
- `openclaw.podman.env/`
- `package.json/`
- `packages/` — Workspace packages or modules.
- `patches/`
- `pnpm-lock.yaml/`
- `pnpm-workspace.yaml/`
- `README.md/`
- `render.yaml/`
- `scripts/`
- `SECURITY.md/`
- `setup-podman.sh/`
- `skills/`
- `src/` — TypeScript source files and CLI entrypoints.
- `Swabble/`
- `test/`
- `tsconfig.json/`
- `tsconfig.plugin-sdk.dts.json/`
- `tsdown.config.ts/`
- `ui/`
- `vendor/`
- `VISION.md/`
- `vitest.config.ts/`
- `vitest.e2e.config.ts/`
- `vitest.extensions.config.ts/`
- `vitest.gateway.config.ts/`
- `vitest.live.config.ts/`
- `vitest.unit.config.ts/`
- `zizmor.yml/`

## Document Map
| Guide | File | Primary Inputs |
| --- | --- | --- |
| Project Overview | `project-overview.md` | Roadmap, README, stakeholder notes |
| Architecture Notes | `architecture.md` | ADRs, service boundaries, dependency graphs |
| Development Workflow | `development-workflow.md` | Branching rules, CI config, contributing guide |
| Testing Strategy | `testing-strategy.md` | Test configs, CI gates, known flaky suites |
| Glossary & Domain Concepts | `glossary.md` | Business terminology, user personas, domain rules |
| Data Flow & Integrations | `data-flow.md` | System diagrams, integration specs, queue topics |
| Security & Compliance Notes | `security.md` | Auth model, secrets management, compliance requirements |
| Tooling & Productivity Guide | `tooling.md` | CLI scripts, IDE configs, automation workflows |
| Swarm Worker Quickstart | `swarm-worker-quickstart.md` | Operacao de times supervisor/worker e cron policy |
| FAQ Enterprise Ops | `faq-enterprise-ops.md` | Perguntas recorrentes de setup e operacao |
