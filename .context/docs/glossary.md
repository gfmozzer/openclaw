---
type: doc
name: glossary
description: Project terminology, type definitions, domain entities, and business rules
category: glossary
generated: 2026-02-21
status: filled
scaffoldVersion: "2.0.0"
---

# Glossary & Domain Concepts

## Core Terms

| Term | Definition |
|------|-----------|
| **OpenClaw** | Open-source AI agent gateway; product name for docs/headings |
| **openclaw** | CLI command, package name, binary, paths, config keys |
| **Gateway** | Control plane process that handles RPC, auth, channel routing (`src/gateway/`) |
| **Pi / Agent Runtime** | The LLM inference engine (`src/agents/pi-embedded-runner/`) |
| **Channel** | Messaging platform connector (WhatsApp, Telegram, Discord, Slack, etc.) |
| **Extension** | Plugin that adds a channel or capability (`extensions/*`) |

## Enterprise Multi-Tenant Terms

| Term | Definition |
|------|-----------|
| **Tenant** | Isolated organizational unit (company/team); identified by `tenantId` |
| **TenantContext** | Runtime context containing `tenantId`, principal info; injected into every request |
| **TenantResolver** | Service that extracts tenant from channel payload (phone, userId, accountId) |
| **BYOK** | Bring Your Own Key — per-request LLM API key override |
| **RLS** | Row Level Security — PostgreSQL policy enforcing tenant isolation at DB level |

## Authorization Terms

| Term | Definition |
|------|-----------|
| **RBAC/ABAC** | Role/Attribute-Based Access Control — deny-by-default authorization |
| **EnterpriseIdentity** | Authenticated caller (type from enterprise-orchestration contract) |
| **EnterpriseRole** | Permission level: `operator.admin`, `operator.read`, `agent.supervisor`, `agent.worker` |
| **EnterpriseScope** | Action boundary: what a role can do within a tenant |

## Swarm Terms

| Term | Definition |
|------|-----------|
| **Swarm** | A team of agents working together on tasks |
| **Supervisor** | Agent that can schedule work for itself and its team workers |
| **Worker** | Agent that can only schedule work for itself |
| **SwarmTeam** | Named group with one supervisor and N workers (same tenant) |
| **SwarmDirectoryStore** | Registry of team topology (supervisor → workers mapping) |

## Scheduling Terms

| Term | Definition |
|------|-----------|
| **Temporal** | Temporal.io — durable workflow orchestration platform |
| **SchedulerOrchestrator** | Port interface for job scheduling (register, cancel, get, callback, resume) |
| **correlationId** | Unique ID linking async operations end-to-end for tracing |
| **Resume Signal** | Mechanism to continue a paused workflow after callback |
| **Orchestration Mode** | `local` (in-process cron) or `temporal` (distributed via Temporal) |

## Stateless Architecture Terms

| Term | Definition |
|------|-----------|
| **Port/Contract** | Interface defining state access (e.g., `SessionStateStore`) |
| **Adapter** | Implementation of a port (e.g., `InMemorySessionStateStore`, `RedisIdempotencyStore`) |
| **Composition Root** | `src/gateway/stateless/runtime.ts` — wires adapters based on environment |
| **Tool Bus** | Remote skill execution channel (HTTP to n8n/MCP/webhooks) |
| **Skill Adapter** | Bridge between local skills and remote Tool Bus execution |

## Infrastructure Terms

| Term | Definition |
|------|-----------|
| **pgvector** | PostgreSQL extension for vector similarity search (RAG embeddings) |
| **Prisma** | ORM for PostgreSQL schema management and migrations |
| **Docker Swarm** | Container orchestration for deploying agent services |
| **MinIO** | S3-compatible object storage for local/self-hosted deployments |

## Error Codes

| Code | Meaning |
|------|---------|
| `UNAUTHORIZED_REQUESTER` | Identity not recognized |
| `FORBIDDEN_SCOPE` | Role lacks required permission |
| `CROSS_TENANT_FORBIDDEN` | Attempted access across tenant boundary |
| `WORKFLOW_CONTEXT_MISSING` | Required correlation context absent |
| `SCHEDULE_FORBIDDEN` | Caller cannot schedule for target |
| `TARGET_NOT_IN_TEAM` | Target agent not in caller's team |
