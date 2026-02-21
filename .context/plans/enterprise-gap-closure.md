---
status: filled
generated: 2026-02-21
title: "Enterprise Gap Closure (Temporal + RBAC + Swarm + Runtime Override)"
owner: "backend-specialist"
---

# Enterprise Gap Closure Plan

> Objetivo: fechar os gaps de backend para operacao enterprise multi-tenant, com contratos claros para o frontend.

## Task Snapshot
- **Primary goal:** entregar backend pronto para swarm de agentes com autorizacao forte, jobs assincronos duraveis e override dinamico por requisicao.
- **Success signal:** fluxo supervisor/worker funcionando com Temporal real, bloqueio de acesso indevido por role/scope, memoria multi-tenant isolada e contratos API sincronizados com frontend.
- **Out of scope:** implementacao visual de telas (sera feita por outro agente), migracoes de dados produtivos legados.

## Gaps Confirmados (As-Is)
1. Temporal ainda parcial: `cron.add/remove` com bridge, sem runtime Temporal completo e sem resume de contexto.
2. Permissoes fragmentadas: existe policy de scheduler, mas nao ha gate central ABAC/RBAC para tools/skills/workflows.
3. Swarm backend incompleto: frontend pode listar/editar time, mas backend ainda nao fecha ciclo completo de diretorio de servicos + roteamento.
4. Override dinamico parcial: provider/model/soul por request existe, mas BYOK por request e contrato de seguranca ainda incompletos.
5. Infra distribuida incompleta: Redis e fila/idempotencia distribuidos ainda nao implementados.
6. Desalinhamento frontend/backend em contratos de operacao.

## Fases (PREVC)

### Phase P - Contratos e desenho tecnico
**Primary agent:** `architect-specialist`

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| P1 | Consolidar contratos de API para swarm, scheduler e callback async | architect-specialist | completed | ADR + DTOs versionados (WF10) |
| P2 | Definir modelo de autorizacao: identity -> role -> scope -> action | security-auditor | completed | Matriz ABAC/RBAC (WF10/12) |
| P3 | Definir contrato de estado assincrono (request, wait, signal, resume) | backend-specialist | completed | Spec Temporal workflow (WF11) |
| P4 | Definir contrato de sincronizacao backend/frontend | frontend-specialist | completed | Backend-frontend contract (WF14) |

**Checkpoint:** `chore(plan): close enterprise contracts and acceptance criteria`

### Phase R - Review de riscos e seguranca
**Primary agent:** `security-auditor`

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| R1 | Revisar superfices de ataque de override BYOK | security-auditor | completed | Anti-escalation guardrail (WF13) |
| R2 | Revisar risco de cross-tenant memory/tool access | security-auditor | completed | RAG tenant guard + RLS (WF03/15) |
| R3 | Revisar autorizacao de supervisor/worker em todos os caminhos | code-reviewer | partial | Policy tests ok, bypass audit pending |

**Checkpoint:** `chore(plan): approve security gates for enterprise runtime`

### Phase E - Implementacao backend
**Primary agent:** `feature-developer`

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| E1 | Implementar adapter Temporal real (start, signal, query, cancel) | backend-specialist | completed | `TemporalSchedulerOrchestrator` (WF11) |
| E2 | Implementar callback async -> signal -> resume com correlationId | backend-specialist | completed | Fluxo duravel E2E (WF11) |
| E3 | Implementar gate central ABAC/RBAC para skill/tool/workflow | security-auditor | completed | `AuthorizationService` compartilhado (WF12) |
| E4 | Implementar Team/Swarm Directory persistente multi-tenant | database-specialist | completed | Store + API backend (WF12), schema Prisma (WF15) |
| E5 | Implementar BYOK por request com redacao de segredos em logs | backend-specialist | partial | Override ok (WF13), redacao de segredos pendente |
| E6 | Implementar Redis para idempotencia/locks/queue state | devops-specialist | completed | Adapter Redis pronto (WF13) |
| E7 | Alinhar contratos com frontend (sem mexer na UI) | backend-specialist | completed | Backend-frontend contract (WF14) |

**Checkpoint:** `feat(enterprise): temporal-rbac-swarm-byok backend complete`

### Phase V - Validacao e observabilidade
**Primary agent:** `test-writer`

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| V1 | Testes unitarios da matriz de autorizacao | test-writer | completed | 22+ tests (WF14) |
| V2 | Testes integracao Temporal (schedule/signal/resume/cancel) | test-writer | completed | 8 tests (WF14) |
| V3 | Testes multi-tenant (cross-tenant deny) | security-auditor | pending | Evidencias de isolamento E2E |
| V4 | Testes de carga basica para scheduler e tool bus remoto | performance-optimizer | pending | Relatorio p95/p99 |
| V5 | Dashboard/metricas de auditoria (allow/deny/resume failures) | devops-specialist | completed | runtime-metrics + system.metrics RPC (WF14) |

**Checkpoint:** `test(enterprise): validate temporal-rbac-multitenant guarantees`

### Phase C - Complete / handoff
**Primary agent:** `documentation-writer`

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| C1 | Atualizar runbooks de deploy swarm + envs | documentation-writer | completed | 14-runbook-deploy-swarm.md + 14-env-guide-enterprise.md (WF14) |
| C2 | Atualizar contratos API para frontend e n8n | documentation-writer | completed | 14-backend-frontend-contract.md (WF14) |
| C3 | Registrar backlog residual e deprecacoes | architect-specialist | completed | Gaps documentados em .context/docs/project-overview.md |

**Checkpoint:** `docs(enterprise): handoff complete with runbooks and contracts`

## Quebra em Workflows Executaveis
1. `.agent/workflows/10-enterprise-contract-and-security.md`
2. `.agent/workflows/11-temporal-async-resume-backend.md`
3. `.agent/workflows/12-central-rbac-and-swarm-directory-backend.md`
4. `.agent/workflows/13-byok-override-and-distributed-runtime.md`
5. `.agent/workflows/14-validation-observability-and-handoff.md`

## Dependencias
- Temporal cluster disponivel (namespace e credenciais de app).
- Redis disponivel para idempotencia e locks distribuidos.
- Bucket S3/MinIO compartilhado com prefixo por tenant.
- Contrato de identidade do solicitante vindo do canal/n8n.

## Riscos e mitigacao
| Risco | Prob. | Impacto | Mitigacao |
| --- | --- | --- | --- |
| Resume com contexto incompleto | Media | Alto | Persistir estado minimo + correlationId obrigatorio |
| Escalada de privilegio por override | Media | Alto | Gate central com deny-by-default e allowlist por role |
| Drift frontend/backend | Alta | Medio | OpenAPI versionado + testes de contrato |
| Locking inconsistente em multiplas replicas | Media | Alto | Redis lock/idempotency key padrao |
| Vazamento de segredo em logs | Baixa | Alto | Redacao centralizada + auditoria |

## Rollout
1. Deploy com feature flags desligadas (`*_ENABLED=0`).
2. Ativar em staging por tenant de teste.
3. Executar suites de integracao, seguranca e carga.
4. Canary em 1 tenant produtivo.
5. Expandir gradualmente.

## Rollback
1. Desligar flags de Temporal real e gate central.
2. Reverter para scheduler local/self-only temporariamente.
3. Preservar auditoria e correlation IDs para RCA.
4. Abrir incidente tecnico com patch plan.

## Success Metrics
- 0 execucoes cross-tenant aprovadas.
- 0 worker agendando para outro worker.
- 100% jobs async com correlationId auditavel.
- 100% overrides BYOK com redacao de segredo em log.
- p95 schedule/start workflow dentro da meta acordada.
