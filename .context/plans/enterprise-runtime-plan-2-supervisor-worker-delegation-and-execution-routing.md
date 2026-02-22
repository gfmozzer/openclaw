---
title: "Enterprise Runtime Plan 2: Supervisor Worker Delegation And Execution Routing"
status: completed
priority: HIGH
parallelizable: partial
updated: 2026-02-23
owner: "backend-orchestration"
---

# Plan 2: Supervisor Worker Delegation And Execution Routing

## Objetivo

Implementar a politica que separa:
- execucao direta (inline)
- fila de curto prazo (Redis/BullMQ/pub-sub/ephemeral queue)
- orquestracao duravel (Temporal)

E estabelecer delegacao segura entre supervisor/manager e workers internos (sem canal externo).

## Dependencias

- **Depende do Plan 0** (contracts: `ExecutionDecision`, `DelegationEnvelope`, `RequestSource`)
- **Integra com Plan 1** para `effectiveScopes`/policy de quem pode delegar para quem

## Escopo (inclui)

- matriz de decisao de execucao por tipo de tarefa/evento
- contrato e handler(s) de delegacao supervisor -> worker
- restricoes de scheduler por role (supervisor pode team/self; worker so self)
- transporte interno para worker sem canal
- observabilidade/auditoria de delegacoes e decisions de execution mode
- testes de policy e de roteamento

## Fora de escopo

- implementacao de toda skill especializada (ex.: relatorio, imagem, etc.)
- runtime completo de cada capability de IA (isso pertence a drivers/tools especificos)
- UI final de observabilidade de filas (pode vir depois)

## Contratos e politicas (obrigatorios)

### 1. `JobClass` / `TaskClass`
Classificacao canonica para roteamento:
- `inline_sync`
- `ephemeral_async`
- `durable_async`
- `scheduled`
- `human_approval` (opcional se integrar com lobster/approval)

### 2. `ExecutionRoutingPolicy`
Entrada:
- `taskType`
- `taskClass`
- `requestSource`
- `timeoutBudgetMs`
- `isIdempotent`
- `canRetry`
- `requiresResume`
- `tenant` / `priority`
Saida:
- `ExecutionDecision`

### 3. `DelegationPolicy`
Regras minimas:
- supervisor/manager pode delegar para workers do time
- worker nao pode delegar para outro worker
- worker pode agendar apenas `self`
- supervisor pode agendar `self` e `team`
- delegated task herda `effectiveScopes` (intersection com scopes do worker/role)
- delegated task herda/reduz `effectiveSkillAllowlist` (quando presente)

### 4. `InternalWorkerInvocationContract`
Contrato para worker sem canal:
- `invoke` (sync) para tarefas pequenas
- `enqueue`/`schedule` (async) para tarefas roteadas por policy
- `callback/resume` quando `Temporal` for escolhido
- worker usa configuracao propria de provider/modelo (nao precisa igual ao supervisor)

## Matriz de decisao (primeira versao a implementar)

### Inline (direto)
Usar quando:
- tarefa curta
- resposta imediata
- sem resume posterior
- sem retry complexo
Ex.: worker de pesquisa devolvendo resumo rapido

### Redis/BullMQ/Ephemeral Queue
Usar quando:
- buffering curto
- burst control
- processamento assinc simples
- retry leve
Ex.: eventos internos, fanout curto, forced updates

### Temporal
Usar quando:
- tarefa longa/duravel
- precisa reexecucao/estado/resume/callback
- cron enterprise
- workflow multi-step entre agentes/ferramentas
Ex.: relatorio pesado, callback de webhook async, job agendado empresarial

## Arquivos alvo (must touch)

### Policy e contratos (backend)
- `src/gateway/stateless/contracts/execution-routing.ts` (Plan 0)
- `src/gateway/stateless/contracts/delegation-envelope.ts` (Plan 0)
- `src/gateway/stateless/contracts/runtime-worker-protocol.ts`
- `src/gateway/stateless/contracts/scheduler-orchestrator.ts`
- `src/gateway/stateless/contracts/enterprise-orchestration.ts`
- `src/gateway/stateless/scheduler-policy.ts`
- `src/gateway/stateless/scheduler-policy.test.ts`

### Handlers / orchestracao
- `src/gateway/server-methods/chat.ts` (delegation + execution decision hook)
- `src/gateway/server-methods/cron.ts` (scheduler restrictions + mode routing)
- `src/gateway/server-methods/swarm.ts` (worker target validation / team membership checks)
- `src/gateway/server-methods/types.ts` (execution decision / delegation context no request context)

### Infra de runtime (dependendo do estado atual dos refactors)
- `src/gateway/stateless/runtime.ts`
- `src/gateway/stateless/*redis*` (ou adapters/queues existentes)
- `src/gateway/stateless/*temporal*`
- `src/process/*` (se houver lane/queue integration relevante)

### Testes (must)
- `src/gateway/server-methods/cron.temporal-scheduling-policy.test.ts`
- `src/gateway/server-methods/cron.temporal-crud.test.ts`
- `src/gateway/server-methods/swarm.test.ts`
- `src/gateway/server-methods/chat.*.test.ts` (novos cenarios de delegacao)
- `src/gateway/stateless/scheduler-policy.test.ts`

## Fases de execucao

### Fase 1 - Policy Matrix + Contracts
**Agente principal:** `architect-specialist`

Tarefas:
1. Definir `taskClass` e tabela de roteamento (inline/redis/temporal).
2. Definir regras de delegacao por role/team.
3. Definir contrato de invocacao interna de worker (sync + async).
4. Definir como `effectiveSkillAllowlist`/restricoes de capacidade entram no `DelegationEnvelope`.
5. Definir codigos de erro canonicos (`DELEGATION_DENIED`, `WORKER_NOT_IN_TEAM`, `EXECUTION_MODE_UNAVAILABLE`, etc.).

Entregaveis:
- tabela de roteamento publicada no plano
- contrato de delegation envelope e policy
- lista de erros e metricas

### Fase 2 - Backend Implementation
**Agente principal:** `backend-specialist`

Tarefas:
1. Implementar `ExecutionRoutingPolicy` e integracao em `chat.ts` / `cron.ts`.
2. Implementar validacao de alvo worker no `swarm` + membership lookup.
3. Implementar invocacao interna (sync) para worker sem canal.
4. Integrar caminhos async com Redis/BullMQ/Temporal conforme `ExecutionDecision`.
5. Propagar `effectiveScopes` e `effectiveSkillAllowlist` (consumindo Plan 1/3, ou stub compativel).

Entregaveis:
- decisions auditaveis por tarefa
- delegation pipeline funcional para worker interno
- enforcement de scheduler por role (self/team)

### Fase 3 - Tests + Observability + Docs
**Agente principal:** `test-writer` + `documentation-writer`

Tarefas:
1. Testar matrix de roteamento (inline/queue/temporal).
2. Testar supervisor vs worker (delegar/schedule).
3. Testar worker sem canal (invocacao apenas interna).
4. Atualizar docs de data flow e FAQ operacional.

Entregaveis:
- testes de policy/delegacao
- runbook de interpretacao das decisions de execution mode
- docs de "quando usar inline vs fila vs Temporal"

## Criterios de aceite

- Nem toda tarefa passa por Temporal; policy decide e isso fica explicito/auditavel.
- Worker interno sem canal pode executar tarefa delegada e usar provider/modelo proprio.
- Supervisor/manager so delega para workers autorizados do time.
- Delegacao preserva/reduz capacidades (`effectiveSkillAllowlist`) e nao permite escalacao indireta.
- Worker nao agenda tarefa para outro worker; apenas self (enforced).
- Scheduler/cron respeita policy enterprise existente + novas regras.

## Paralelizacao

- Pode ser executado em paralelo parcial com Plan 1 e Plan 3 apos Plan 0.
- Requer sincronizacao de contratos de `effectiveScopes` e `requestSource` (nao redefinir localmente).

## Riscos e mitigacoes

- **Risco:** acoplar task routing em `chat.ts` com regras hardcoded por skill.
  - **Mitigacao:** `ExecutionRoutingPolicy` + `TaskClass` centralizados.
- **Risco:** mistura de concerns de scheduler e delegation.
  - **Mitigacao:** contratos separados (`scheduler policy` vs `delegation policy`).


---

## Fase 1 - Completa ✅

### Artefatos Criados

| Artefato | Arquivo | Descrição |
|----------|---------|-----------|
| TaskClass | `src/gateway/stateless/contracts/task-class.ts` | Classificação canônica de tarefas (inline_sync, ephemeral_async, durable_async, scheduled, human_approval) |
| ExecutionRoutingPolicy | `src/gateway/stateless/contracts/execution-routing.ts` | Política de roteamento com fallback chain |
| DelegationPolicy | `src/gateway/stateless/contracts/delegation-policy.ts` | Regras de delegação por role (supervisor/worker/admin) |
| InternalWorkerInvocation | `src/gateway/stateless/contracts/internal-worker-invocation.ts` | Contrato sync_invoke, async_enqueue, schedule, callback |
| Erros Canônicos | `src/gateway/stateless/contracts/enterprise-orchestration.ts` | DELEGATION_DENIED, WORKER_NOT_IN_TEAM, EXECUTION_MODE_UNAVAILABLE, etc. |
| Matriz de Roteamento | `enterprise-runtime-plan-2-execution-routing-matrix.md` | Documentação completa com exemplos |

### Entregáveis Fase 1

- ✅ `TaskClass / JobClass` final (tabela de roteamento)
- ✅ `ExecutionRoutingPolicy` (input/output)
- ✅ `DelegationPolicy` (regras supervisor/worker/team/self)
- ✅ `InternalWorkerInvocationContract` (invoke/enqueue/schedule/callback)
- ✅ Erros canônicos definidos
- ✅ Matriz publicada no plano + exemplos de `ExecutionDecision`

### Links

📄 **Matriz de Roteamento Completa:** [.context/plans/enterprise-runtime-plan-2-execution-routing-matrix.md](./enterprise-runtime-plan-2-execution-routing-matrix.md)

### Próximos Passos (Fase 2)

Aguardando início da Fase 2 (Backend Implementation):
1. Implementar `ExecutionRoutingPolicy` em `chat.ts`
2. Integrar com `cron.ts` para scheduling restrictions
3. Validar target worker em `swarm.ts`
4. Implementar `InternalWorkerInvoker`
5. Integrar com Redis/BullMQ e Temporal existentes


---

## Fase 2 - Completa ✅

### Artefatos Implementados

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| InternalWorkerInvoker | `src/gateway/stateless/internal-worker-invoker.ts` | Implementação do invoker com BullMQ, Temporal e sync |
| Chat Routing | `src/gateway/server-methods/chat.ts` | Integração de ExecutionRoutingPolicy em chat.send |
| Swarm Validation | `src/gateway/server-methods/swarm.ts` | Handler swarm.worker.validate + helper de validação |
| Cron Scheduling | `src/gateway/server-methods/cron.ts` | Já integrado com scheduler-policy.ts |
| Testes | `*.test.ts` | 39 testes cobrindo TaskClass, DelegationPolicy, ExecutionRouting |

### Testes Criados

| Arquivo | Testes | Cobertura |
|---------|--------|-----------|
| `task-class.test.ts` | 17 | Classificação de tarefas, metadados, mapeamento |
| `delegation-policy.test.ts` | 11 | Regras por role, team membership, cross-tenant |
| `execution-routing.test.ts` | 11 | Decision matrix, fallback chain, tenant overrides |

### Integrações

1. **chat.ts**: 
   - Importa `classifyTask`, `createDefaultExecutionRoutingPolicy`
   - Função `resolveChatExecutionDecision()` para determinar modo de execução
   - Registra `executionDecision` no contexto
   - Audita decision via `auditEventStore`

2. **swarm.ts**:
   - Novo handler `swarm.worker.validate`
   - Função `validateWorkerDelegation()` helper
   - Suporta admin (cross-team), supervisor (mesma team), worker (self only)

3. **cron.ts**:
   - Já utilizava `authorizeSchedulerAction` do `scheduler-policy.ts`
   - Alinhado com regras do Plan 2

4. **internal-worker-invoker.ts**:
   - Implementa `InternalWorkerInvoker` interface
   - Integra com BullMQ (Redis) para ephemeral
   - Integra com `SchedulerOrchestrator` para temporal
   - Validações de disponibilidade de modo

### Próximos Passos (Fase 3 - Futuro)

- Testes de integração end-to-end
- Observabilidade: métricas de routing decisions
- Documentação operacional: runbook de interpretação
- UI de observabilidade de filas e workflows

---

## Resumo Completo do Plan 2

### Fase 1 ✅
- Contratos definidos (TaskClass, ExecutionRoutingPolicy, DelegationPolicy, InternalWorkerInvocation)
- Erros canônicos adicionados
- Matriz de roteamento documentada

### Fase 2 ✅
- InternalWorkerInvoker implementado
- ExecutionRoutingPolicy integrado em chat.ts
- Swarm worker validation implementado
- Cron scheduling já alinhado
- Testes unitários criados (39 testes)

**Plan 2 COMPLETO (fundação backend)** - Pronto para Fase 3 (testes de integração, observabilidade, docs)

### Gap operacional explicitado (nao coberto por este plano)

Este plano entregou:
- policy de delegacao
- validacao de worker (`swarm.worker.validate`)
- invoker interno (`InternalWorkerInvoker`)

Mas **nao** entregou (ficou para follow-up):
- RPC publico `swarm.worker.invoke` para operador/admin disparar worker diretamente
- status/presenca online de worker no painel de swarm
- UX de teste/invocacao no Control UI

Esses itens agora estao planejados em:
- `enterprise-runtime-plan-4-admin-direct-worker-invoke-backend.md`
- `enterprise-runtime-plan-5-swarm-worker-presence-and-control-ui.md`
