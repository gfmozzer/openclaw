---
type: doc
name: project-overview
description: High-level overview of the project, its purpose, and key components
category: overview
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Project Overview

## What is this fork?

This is a fork of **OpenClaw** — an open-source AI agent gateway that connects LLM-powered agents to messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, etc.) and exposes them via a unified API.

The fork transforms OpenClaw from a **single-user local assistant** into an **enterprise multi-tenant agent platform** (codename "Automadesk Agent Core"). The goal is to support 80+ employees across independent companies, with agent swarms, durable scheduling, per-tenant isolation, and a chat-first customer portal.

## Transformation Roadmap (Workflows 01–16)

The transformation was planned and executed across 16 incremental workflows documented in `.agent/workflows/`. Each workflow has a plan (`.md`) and most have an output (`.output.md`) confirming what was delivered.

### Completed (backend)

| # | Workflow | Summary |
|---|----------|---------|
| 01 | Setup & Analysis | Codebase deep-dive, message flow mapping, As-Is architecture diagram |
| 02 | NestJS & Statelessness | Stateless port contracts (session, memory, idempotency, message bus) + in-memory adapters |
| 03 | Multi-Tenancy | Tenant context/resolver, S3 partition, RAG tenant guard, WhatsApp/Telegram tenant injection |
| 04 | Temporal Orchestration | Scheduler orchestrator contract, cron mode flag (local/temporal), gateway bridge |
| 05 | Skill Adapter & Tool Bus | Skill loader + tool bus dispatcher contracts, HTTP remote execution, node adapters |
| 10 | Enterprise Contract | Enterprise identity/role/scope types, standard error codes, async schedule/callback/resume types |
| 11 | Temporal Async Resume | Temporal HTTP bridge adapter, callback/resume RPC methods, correlationId-based resume |
| 12 | RBAC & Swarm Directory | Central authorization service, swarm directory store, swarm CRUD RPC endpoints |
| 13 | BYOK & Distributed Runtime | Per-request provider/model/apiKey override, Redis adapters (idempotency + message bus) |
| 14 | Validation & Observability | 22+ tests, runtime metrics, `system.metrics` RPC, alert thresholds, deploy runbook, env guide |
| 15 | PostgreSQL + Prisma | Full multi-tenant schema (17 models), pgvector, RLS policies, Docker Compose for local Postgres |
| 16 | Chat Portal (MVP) | Chat portal contract RPC, stack health probe, 5 new chat metrics counters |

### Not yet implemented (plan only)

| # | Workflow | Summary |
|---|----------|---------|
| 06 | Agnostic Dashboard | Decouple frontend from localhost, connection screen, multi-bot switching |
| 07 | Dynamic Model Override | Per-request model/key (partially addressed by WF13) |
| 08 | Memory Management UI | S3 file explorer, LTM CRUD, searchable memory table, token usage view |
| 09 | Swarm Orchestration UI | Agent role toggles, team builder, swarm topology graph |

## Key New Directories

- `src/gateway/stateless/` — all new stateless contracts, adapters, and composition root
- `src/gateway/stateless/contracts/` — port interfaces (session, memory, idempotency, scheduler, skill, swarm, enterprise)
- `src/gateway/stateless/adapters/in-memory/` — in-memory implementations for local/dev
- `src/gateway/stateless/adapters/node/` — production adapters (Redis, Temporal HTTP, HTTP tool bus)
- `src/gateway/stateless/multitenancy/` — tenant context, resolver, S3 partition, RAG guard
- `prisma/` — Prisma 7 schema and migrations (PostgreSQL + pgvector)

## Known Gaps

1. **No `SET app.tenant_id` per request** — RLS policies exist but app-level tenant injection is not wired yet
2. **BYOK envelope encryption** — not implemented; keys are passed in plaintext through the stack
3. **Cross-tenant integration tests** — only unit-level isolation tests exist
4. **Frontend workflows (06, 07, 08, 09)** — all plan-only, no implementation
5. **Redis connectivity** — adapter exists but host-to-container connectivity not validated in CI
6. **Temporal real cluster** — HTTP bridge adapter exists but not tested against a live Temporal deployment
