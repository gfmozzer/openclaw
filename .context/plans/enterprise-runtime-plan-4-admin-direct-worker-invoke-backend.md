---
title: "Enterprise Runtime Plan 4: Admin Direct Worker Invoke Backend"
status: pending
priority: HIGH
parallelizable: partial
updated: 2026-02-23
owner: "backend-orchestration"
---

# Plan 4: Admin Direct Worker Invoke Backend

## Objetivo

Fechar o gap operacional entre o que o Plan 2 já entregou (policy, validation, invoker interno) e o que ainda falta para uso real:

- `admin` (e supervisor autorizado) conseguir **invocar um worker diretamente** via RPC
- usar `DelegationPolicy` + `ExecutionRoutingPolicy` + `InternalWorkerInvoker`
- suportar execução `inline`, `redis_ephemeral` e `temporal_workflow` de forma auditável

## Contexto (estado atual)

Já existe:
- `DelegationPolicy` com regra explícita de `admin` -> qualquer worker do tenant
- `swarm.worker.validate`
- `InternalWorkerInvoker` (sync / enqueue / schedule / callback)
- `ExecutionDecision` no request context (foundation do Plan 0)

Ainda **não existe** (gap):
- RPC público para execução direta de worker (ex.: `swarm.worker.invoke`)
- wiring do `InternalWorkerInvoker` no `GatewayRequestContext`
- schema/validators para `swarm.worker.invoke*`
- fluxo de retorno/resultado para UI (`inline`) e tracking para `async`

## Escopo (inclui)

- RPCs `swarm.worker.invoke` (MVP obrigatório)
- RPC de status mínimo para tarefas delegadas (`swarm.worker.invoke.status` ou equivalente)
- integração com `DelegationPolicy` e `InternalWorkerInvoker`
- auditoria + métricas de decisões de delegação/invocação
- testes unitários e de integração de handler

## Fora de escopo

- UI final (painel de swarm/control UI) → **Plan 5**
- skill específica do worker (relatório/imagem/etc.)
- editor visual de contratos de tool mode

## Contratos (MVP)

### `swarm.worker.invoke`

Entrada (proposta):
- `tenantId`
- `identity` (compat/migração; enquanto Plan 1 não centraliza tudo)
- `targetWorkerAgentId`
- `taskType`
- `payload`
- `preferredExecutionMode?` (`inline | redis_ephemeral | temporal_workflow`)
- `timeoutMs?`
- `trace?`

Saída:
- `accepted: boolean`
- `executionMode`
- `taskId`
- `result?` (quando `inline`)
- `jobRef?` (quando Redis)
- `workflowRef?` (quando Temporal)
- `reason?`

### `swarm.worker.invoke.status` (ou `swarm.worker.task.get`)

Entrada:
- `tenantId`
- `taskId`
- `targetWorkerAgentId?`

Saída:
- `status` (`pending | running | succeeded | failed | cancelled | unknown`)
- `executionMode`
- `result?`
- `error?`
- `trace?`

Observação:
- Se o status unificado for pesado agora, aceitar MVP com:
  - `inline` → retorno imediato em `swarm.worker.invoke`
  - `redis/temporal` → retorno de referência + docs indicando polling em endpoints já existentes

## Arquivos alvo (must touch)

### Handlers / registro RPC
- `src/gateway/server-methods/swarm.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server-methods-list.ts`
- `src/gateway/method-scopes.ts`

### Contexto e wiring
- `src/gateway/server-methods/types.ts` (adicionar `internalWorkerInvoker?`)
- `src/gateway/server.impl.ts` (injeção no contexto)
- `src/gateway/stateless/runtime.ts` (factory/wiring do invoker)

### Contratos / protocol / validation
- `src/gateway/stateless/contracts/internal-worker-invocation.ts` (revisões mínimas, se necessário)
- `src/gateway/protocol/index.ts`
- `src/gateway/protocol/schema/*` (adicionar schema/validator de `swarm.worker.invoke*`; criar arquivo se não existir)

### Testes (must)
- `src/gateway/server-methods/swarm.test.ts`
- `src/gateway/server-methods/swarm.worker.invoke.test.ts` (novo)
- `src/gateway/stateless/internal-worker-invoker.test.ts` (novo, se ainda não existir)

## Fases

### Fase 1 - Contract Freeze + RPC Shape (rápida)
1. Definir payload de `swarm.worker.invoke`
2. Definir retorno unificado (`inline` vs async refs)
3. Definir escopo mínimo (`swarm:invoke` ou `swarm:write`)
4. Congelar erro canônico (ex.: `DELEGATION_DENIED`, `EXECUTION_MODE_UNAVAILABLE`)

Entregável:
- contrato de request/response no plano + schema no protocolo

### Fase 2 - Backend Handler + Wiring
1. Wiring do `InternalWorkerInvoker` no contexto
2. Handler `swarm.worker.invoke`
3. Uso de `swarm.worker.validate`/`DelegationPolicy` antes da invocação
4. Seleção de modo:
   - `preferredExecutionMode` (se permitido)
   - fallback por policy
5. Auditoria e métricas

Entregável:
- RPC funcional (MVP)

### Fase 3 - Tests + Docs
1. Testes `admin`, `supervisor`, `worker`, cross-tenant
2. Testes `inline` / `redis` / `temporal` unavailable
3. Atualizar docs operacionais e FAQ (como invocar worker e interpretar retorno)

## Critérios de aceite

- `admin` consegue invocar worker do mesmo tenant diretamente via RPC
- `supervisor` só consegue invocar worker do próprio time
- `worker` não consegue invocar outro worker
- cross-tenant é bloqueado
- execução retorna resultado imediato (`inline`) ou referência (`async`) de forma clara
- decisão de execução é auditável

## Paralelização

- Pode rodar em paralelo com **Plan 5** após congelar o contrato de `swarm.worker.invoke` (Fase 1).
- Depende do Plan 1 apenas para hardening de entitlements; usar compat/stub enquanto isso.

