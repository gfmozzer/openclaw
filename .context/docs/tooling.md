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

## Contrato de Ambiente (Enterprise)

### Autenticacao Gateway
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_GATEWAY_TOKEN` | Sim (prod) | Token de autenticacao do gateway (operadores/nodes). |
| `OPENCLAW_GATEWAY_PASSWORD` | Nao | Alternativa ao token (nao usar junto em producao sem padrao definido). |

### Feature Flags (Provider UX)
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_PROVIDERS_RPC_ENABLED` | Nao | Habilita/desabilita metodos RPC `providers.*` no backend (default: `1`). |
| `VITE_OPENCLAW_PROVIDERS_UI_ENABLED` | Nao | Habilita/desabilita aba `Providers` no frontend (default: `1`). |

### Drivers por Instancia (SDK/Adaptador)
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_DRIVERS_ENABLED` | Recomendado | Lista de drivers permitidos no container (ex: `native,litellm`). |
| `OPENCLAW_DRIVER_DEFAULT` | Recomendado | Driver padrao para resolver rotas legadas `provider/model`. |
| `OPENCLAW_DRIVER_<ID>_ENABLED` | Nao | Toggle fino por driver (`1/0`) por instancia. |
| `OPENCLAW_DRIVER_<ID>_ENTRY` | Condicional | Entry module para driver externo (caminho local/URL/file spec). |
| `OPENCLAW_DRIVER_<ID>_PACKAGE` | Condicional | Pacote NPM para driver externo (import dinamico por nome de pacote). |

Notas operacionais:
1. Driver externo so e considerado para carga quando `OPENCLAW_DRIVER_<ID>_ENABLED=1/true` estiver explicito.
2. Drivers externos so sao considerados carregados quando o import do `ENTRY`/`PACKAGE` conclui com sucesso.
3. Em falha de import, o gateway sobe, mas o driver aparece em `drivers.failed` no `chat.portal.stack.status`.
4. Rotas de modelo que exigem driver nao carregado falham em `chat.send` com `INVALID_REQUEST` (fail-fast).
5. Drivers logicos `azure` e `fal` podem operar como built-ins gated por ENV (sem pacote externo) nesta fase de transicao.
6. `drivers.*` existe como alias de transicao para `providers.*` enquanto o contrato dedicado de Plan 2 e finalizado.

### Persistencia e Runtime Stateless
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_STATELESS_BACKEND` | Sim (enterprise) | Backend stateless: `in-memory`, `s3`, `prisma`. |
| `DATABASE_URL` | Sim (`prisma`) | Conexao PostgreSQL para runtime Prisma. |
| `DIRECT_URL` | Sim (`prisma` + migracoes) | Conexao direta para migracoes Prisma. |
| `OPENCLAW_S3_BUCKET` | Sim (`s3`) | Bucket compartilhado para memoria/sessoes. |
| `OPENCLAW_S3_REGION` | Sim (`s3`) | Regiao do bucket. |
| `OPENCLAW_S3_ENDPOINT` | Nao | Endpoint custom (MinIO/S3 compativel). |
| `OPENCLAW_S3_FORCE_PATH_STYLE` | Nao | Forca path-style (geralmente `1` com MinIO). |
| `OPENCLAW_S3_ACCESS_KEY_ID` | Sim (`s3`) | Access key do bucket. |
| `OPENCLAW_S3_SECRET_ACCESS_KEY` | Sim (`s3`) | Secret key do bucket. |
| `OPENCLAW_S3_SESSION_TOKEN` | Nao | Sessao temporaria STS. |
| `OPENCLAW_S3_ROOT_PREFIX` | Nao | Prefixo base por instalacao dentro do bucket. |

### Redis Distribuido
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_REDIS_URL` | Sim (multi-replica) | Redis para idempotencia e message bus. |
| `OPENCLAW_REDIS_PREFIX` | Nao | Prefixo de chave para isolar ambientes. |
| `OPENCLAW_REDIS_TLS` | Nao | Habilita TLS no Redis (`1/true`). |

### Temporal / Scheduler
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_CRON_ORCHESTRATION_MODE` | Sim (enterprise async) | `local` ou `temporal`. |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT` | Sim (`temporal`) | Endpoint do orchestrator bridge. |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_AUTH_TOKEN` | Recomendado (`temporal`) | Token bearer gateway -> orchestrator. |
| `OPENCLAW_TEMPORAL_ORCHESTRATOR_TIMEOUT_MS` | Nao | Timeout HTTP do orchestrator. |
| `OPENCLAW_TEMPORAL_TEAM_MAP_JSON` | Recomendado | Mapa supervisor->workers por tenant. |
| `OPENCLAW_TEMPORAL_CALLBACK_SECRET` | Sim (`temporal`) | Segredo HMAC para validar callbacks `cron.callback`. |

### Skill Adapter Remoto
| Variavel | Obrigatoria | Funcao |
|----------|-------------|--------|
| `OPENCLAW_SKILL_ADAPTER_MODE` | Nao | `local` (padrao) ou `remote`. |
| `OPENCLAW_SKILL_TOOLBUS_ENDPOINT` | Sim (`remote`) | Endpoint de execucao de tools/skills remotas. |
| `OPENCLAW_SKILL_TOOLBUS_AUTH_TOKEN` | Recomendado (`remote`) | Token bearer para o tool bus. |
| `OPENCLAW_SKILL_TOOLBUS_TIMEOUT_MS` | Nao | Timeout de chamadas ao tool bus. |
| `OPENCLAW_SKILL_TOOLBUS_KIND` | Nao | Tipo de barramento remoto (metadata operacional). |

### Matriz por Ambiente
| Ambiente | Backend | Minimo recomendado |
|----------|---------|--------------------|
| `dev` | `in-memory` ou `prisma` | token gateway + 1 provider key + postgres opcional |
| `staging` | `prisma` | token gateway + postgres + redis + temporal + callback secret |
| `prod` | `prisma` | tudo de staging + observabilidade + rotacao de segredos + backup |

## Runbook Operacional (resumo)
1. Subir infraestrutura local: Postgres + Redis + MinIO + orchestrator Temporal bridge.
2. Aplicar migracoes Prisma.
3. Iniciar gateway com `OPENCLAW_STATELESS_BACKEND=prisma`.
4. Validar `health`, `system.metrics`, `swarm.team.list`, `cron.add`.
5. Validar callback assinado (`OPENCLAW_TEMPORAL_CALLBACK_SECRET`) e fluxo resume.
6. Conectar canais (quando nao estiver em modo skip): WhatsApp/Telegram/Slack.

## Troubleshooting rapido
| Sintoma | Causa comum | Acao |
|---------|-------------|------|
| `gateway url override requires explicit credentials` | token/password ausente no cliente | passar `--token` ou configurar `gateway.auth.token` |
| `chat.send` retorna `in_flight` repetidamente | mesma `idempotencyKey` ativa | aguardar fim da run ou trocar chave |
| callbacks negados em `cron.callback` | assinatura HMAC invalida/replay | checar secret, timestamp, nonce |
| perda de estado entre replicas | backend ainda `in-memory` | usar `prisma` + redis |
| cross-tenant bloqueado | tenant/scopes inconsistentes | revisar `tenantContext` e escopos no connect |

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
