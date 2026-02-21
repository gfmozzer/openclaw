---
status: filled
generated: 2026-02-21
title: "Temporal Scheduling Policy - Supervisor and Workers"
owner: "backend-specialist"
---

# Temporal Scheduling Policy for Supervisor and Workers Plan

> Objetivo: habilitar agendamento via Temporal IO com controle de autorização por papel e isolamento por tenant.

## Task Snapshot
- **Primary goal:** Implementar regra de agendamento onde `supervisor` agenda para si e para workers do seu time, e `worker` agenda apenas para si.
- **Success signal:** Nenhuma execução cross-tenant; nenhuma execução worker->outro worker; auditoria registra `who scheduled for whom`.
- **Escopo:** API/Gateway, orquestração Temporal, modelo de time, validação de permissão, testes e documentação.

## Policy Contract (Fonte de verdade)

### Roles
- `supervisor`: pode agendar para `self` e para membros do time configurado.
- `worker`: pode agendar somente para `self`.

### Scheduling Rules
| Caller Role | Target Allowed | Resultado |
| --- | --- | --- |
| supervisor | self | allow |
| supervisor | worker do mesmo tenant e mesmo team | allow |
| supervisor | worker fora do team | deny |
| supervisor | qualquer agente de outro tenant | deny |
| worker | self | allow |
| worker | qualquer outro agente | deny |

### Mandatory Attributes por requisição
- `tenantId`
- `callerAgentId`
- `callerRole`
- `targetAgentId`
- `workflowType`
- `idempotencyKey`
- `requestedAt`

## Arquitetura Alvo (Temporal + Multi-tenant)

### Boundary de responsabilidade
- `Gateway/API`: autentica, autoriza (RBAC + team scope), valida payload, emite comando de agendamento.
- `Scheduler Service`: converte comando em `Temporal client.start(...)` com headers/memo obrigatórios.
- `Temporal Workflow`: executa tarefa para o `targetAgentId` sem decidir autorização.
- `Worker Runtime`: executa apenas workflows roteados para seu `agentId`.

### Guardrails obrigatórios
- Validar `tenantId` do caller e do target antes de chamar Temporal.
- Headers Temporal contendo `tenantId`, `callerAgentId`, `targetAgentId`, `callerRole`, `policyVersion`.
- Namespace Temporal por ambiente; isolamento lógico por `tenantId` no payload e nas queries.
- Idempotência por chave (`tenantId + callerAgentId + targetAgentId + idempotencyKey`).

## Phase 1 — Discovery & Contract (P)
**Primary Agent:** `architect-specialist`

**Objective:** fechar contrato funcional e técnico antes da implementação.

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 1.1 | Mapear fluxos atuais de agendamento/mensageria no gateway e runtime | `backend-specialist` | pending | Documento de fluxo atual/as-is |
| 1.2 | Definir contrato de autorização (`canSchedule(caller, target, tenant, team)`) | `security-auditor` | pending | Especificação de policy |
| 1.3 | Definir modelo de team (supervisor -> workers) e origem dos dados (env/config/API) | `database-specialist` | pending | Schema/config draft |
| 1.4 | Definir contrato de comando de scheduling + campos de auditoria | `architect-specialist` | pending | DTO/interface versionada |

**Checkpoint de saída**
- ADR curta com regras finais.
- Critérios de aceite assinados pelo time.

## Phase 2 — Implementation (E)
**Primary Agent:** `feature-developer`

**Objective:** implementar agendamento com enforcement de policy.

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 2.1 | Criar `AuthorizationPolicyService` com matriz supervisor/worker | `backend-specialist` | completed | `src/gateway/stateless/scheduler-policy.ts` + testes |
| 2.2 | Integrar policy no endpoint/comando de schedule (fail-fast 403) | `feature-developer` | completed | Enforcement em `cron.add` e `cron.remove` (modo temporal) |
| 2.3 | Implementar `TemporalSchedulerService` com headers/memo obrigatórios | `backend-specialist` | pending | Adapter Temporal |
| 2.4 | Implementar resolução de team por tenant (`TeamDirectory`) | `database-specialist` | completed | Resolver via env `OPENCLAW_TEMPORAL_TEAM_MAP_JSON` |
| 2.5 | Adicionar audit log (`scheduler.audit`) para allow/deny | `devops-specialist` | pending | Log estruturado + correlação |
| 2.6 | Front-end/API admin para cadastro de time (supervisor->workers) | `frontend-specialist` | pending | Tela/endpoint de gestão |
| 2.7 | Garantir worker self-only em qualquer caminho alternativo | `security-auditor` | pending | Testes de bypass fechados |

**Entregas técnicas mínimas**
- `schedule-job` exige `targetAgentId`.
- Worker não pode omitir target para tentar fallback indevido.
- Erros padronizados: `SCHEDULE_FORBIDDEN`, `TARGET_NOT_IN_TEAM`, `CROSS_TENANT_FORBIDDEN`.

## Phase 3 — Validation & Handoff (V)
**Primary Agent:** `test-writer`

**Objective:** comprovar segurança e comportamento esperado.

| # | Task | Agent | Status | Deliverable |
| --- | --- | --- | --- | --- |
| 3.1 | Testes unitários de policy (matriz completa) | `test-writer` | completed | `scheduler-policy.test.ts` |
| 3.2 | Testes integração Gateway -> Temporal (headers + idempotência) | `test-writer` | completed | `cron.temporal-scheduling-policy.test.ts` |
| 3.3 | Testes E2E multi-tenant (A nunca agenda em B) | `security-auditor` | pending | Evidência de isolamento |
| 3.4 | Testes de regressão de workers (self permitido, peer bloqueado) | `test-writer` | pending | Relatório de regressão |
| 3.5 | Documentação operacional + exemplos de payload | `documentation-writer` | pending | Runbook + API docs |

**Definition of Done**
- 100% da matriz de autorização coberta por teste.
- Logs de auditoria com correlação por request/job.
- Política ativa por feature flag em staging com smoke tests aprovados.

## Quebra em Subtarefas Executáveis

### Bloco A - Policy engine
- Implementar função pura `canSchedule`.
- Cobrir combinações role/tenant/team/target.

### Bloco B - Team directory
- Fonte inicial por configuração/env.
- Interface pronta para migrar para banco/API sem quebrar contrato.

### Bloco C - Temporal adapter
- `startWorkflow` com metadata obrigatória.
- Retry/backoff e erro padronizado.

### Bloco D - Observabilidade e segurança
- Audit log para allow/deny.
- Métricas: `schedule_requests_total`, `schedule_denied_total`, `schedule_cross_tenant_denied_total`.

### Bloco E - UX de operação
- Cadastro de time no front-end.
- Validação prévia de permissões no formulário.

## Riscos e Mitigações
| Risco | Prob. | Impacto | Mitigação |
| --- | --- | --- | --- |
| Team mapping inconsistente entre serviços | Média | Alto | Fonte única (`TeamDirectory`) e cache com TTL curto |
| Bypass por endpoint legado | Média | Alto | Centralizar policy no serviço compartilhado e remover caminhos paralelos |
| Falta de rastreabilidade em incidentes | Baixa | Alto | Audit logs obrigatórios com requestId/workflowId |
| Erro de configuração cross-tenant | Média | Alto | Validação de tenant no bootstrap + healthcheck |

## Rollout Plan
1. Deploy com feature flag `TEMPORAL_RBAC_SCHEDULING_ENABLED=false`.
2. Ativar em staging com tenants de teste.
3. Rodar suíte E2E + carga leve.
4. Ativar canário em produção para 1 tenant.
5. Expansão gradual para todos os tenants.

## Rollback Plan
1. Desativar `TEMPORAL_RBAC_SCHEDULING_ENABLED`.
2. Retornar para fluxo anterior somente para agendamento self.
3. Preservar logs/auditoria para investigação.
4. Abrir incidente técnico com causa raiz e patch plan.

## Artefatos Esperados
- ADR: política de scheduling por papel.
- Documento de contrato API/DTO.
- Test report unit/integration/E2E.
- Dashboard com métricas de allow/deny.
- Guia operacional de cadastro de times.

## Execution Log (2026-02-21)
- Implementado backend-only conforme solicitado (sem mudanças de UI).
- Adicionada policy de autorização supervisor/worker com isolamento por tenant.
- Adicionado Team Directory por variável de ambiente:
  - `OPENCLAW_TEMPORAL_TEAM_MAP_JSON`
- Temporal bridge (`cron.add`/`cron.remove`) agora:
  - valida caller/target/tenant antes de registrar/cancelar workflow;
  - responde `FORBIDDEN` com razão (`SCHEDULE_FORBIDDEN`, `TARGET_NOT_IN_TEAM`, `CROSS_TENANT_FORBIDDEN`) quando negar;
  - propaga metadata de auditoria no payload de registro.
- Testes executados com sucesso:
  - `pnpm vitest run src/gateway/stateless/scheduler-policy.test.ts src/gateway/server-methods/cron.temporal-scheduling-policy.test.ts`
  - `pnpm tsgo`

## Success Metrics
- `0` execuções cross-tenant.
- `0` agendamentos worker->peer aceitos.
- `100%` de requests com metadata de auditoria completa.
- Latência p95 de scheduling dentro da meta definida pelo time.
