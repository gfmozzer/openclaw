---
title: "Enterprise Runtime Plan 0: Contracts And Request Context"
status: completed
priority: CRITICAL
parallelizable: no
updated: 2026-02-23
owner: "platform-architecture"
---

# Plan 0: Contracts And Request Context

## Objetivo

Definir contratos canonicos e pontos de injecao para:
- identidade do requisitante
- origem da requisicao (canal, API trusted, supervisor interno, job)
- overrides (patch parcial + policy)
- decisao de execucao (inline / redis / temporal)
- delegacao supervisor -> worker

Este plano e o **alicerce** para os planos 1, 2 e 3.

## Escopo (inclui)

- tipos/contratos TypeScript no gateway stateless
- extensao de `GatewayRequestContext` e request envelopes
- schemas/protocol para novos campos de contexto (quando aplicavel)
- policy interfaces (sem implementar toda a regra ainda)
- regras de merge de override (contrato, nao enforcement completo)
- contratos de delegacao e decisao de execucao
- testes unitarios de merge/normalizacao/compat
- docs de arquitetura e glossario

## Fora de escopo (neste plano)

- persistencia final de identidade/RBAC (Plan 1)
- enforcement completo de autorizacao em handlers (Plan 1)
- executores Redis/BullMQ/Temporal (Plan 2)
- trusted frontdoor e filtros finais de override (Plan 3)

## Contratos a definir (obrigatorios)

### 1. `RequestSource`
Enum canonico:
- `channel_direct`
- `trusted_frontdoor_api`
- `internal_supervisor`
- `system_job`
- `operator_ui` (opcional, se quiser separar control UI)

### 2. `ChannelIdentity`
Representa origem tecnica do canal (telefone, chatId, accountId etc.), sem assumir autorizacao.
Campos minimos:
- `channelId`
- `accountId`
- `subjectId` (telefone/jid/user id)
- `threadId/sessionKey` (opcional)
- `displayName` (opcional)

### 3. `EnterprisePrincipalRef` (stub/contract)
Resultado esperado da resolucao de identidade (Plan 1 implementa de fato).
Campos minimos:
- `tenantId`
- `principalId`
- `role`
- `scopes[]`
- `attributes` (department, costCenter, groups, region, etc.)

### 4. `OverridePatch` + `OverrideResolution`
Patch parcial por request:
- `provider`, `model`, `systemPrompt`, `soul`, `apiKey`, `authProfileId`, `skillAllowlist`, `optimizationMode`, etc.
Com resultado de merge:
- `effectiveConfig`
- `effectiveSkillAllowlist` (separado e explicito)
- `effectiveOptimizationPolicy` (opcional; pode referenciar perfil resolvido)
- `appliedFields[]`
- `rejectedFields[]` (com motivo)
- `origin`

Semantica minima obrigatoria:
- `skillAllowlist` no patch **nao** substitui autorizacao; ele apenas restringe/solicita capacidades
- `effectiveSkillAllowlist` deve suportar interseccao com policy (Plan 1) e defaults do agente (Plan 3)
- `optimizationMode`/hints no patch **nao** sao obrigatorios e devem cair em fallback (`balanced/default`) quando ausentes ou nao suportados

### 5. `ExecutionDecision`
Saida da policy de roteamento (Plan 2 implementa engine):
- `mode: inline | redis_ephemeral | temporal_workflow`
- `queue/topic/workflowType` (opcional por modo)
- `reason`
- `priority`
- `retryPolicyRef` (opcional)

### 6. `DelegationEnvelope`
Contrato supervisor -> worker:
- `taskId`
- `taskType`
- `targetWorkerAgentId`
- `delegatedBy` (supervisor principal)
- `originalRequester` (principal/caller)
- `effectiveScopes[]`
- `effectiveSkillAllowlist[]` (opcional, quando task exigir restricao explicita por capacidade)
- `executionDecision`
- `payload`
- `trace` (requestId, sessionKey, correlationId)

### 7. `TrustedFrontdoorDispatchContext` (stub/contract)
Contrato tecnico para origem enterprise que faz "payload builder" antes do OpenClaw.
Campos minimos:
- `frontdoorId`
- `requestSource = trusted_frontdoor_api`
- `claimsRef` (ou `trustedClaims`)
- `businessContext` (plan/segment/role labels sem segredos)
- `requestedCapabilities` (ex.: `skillAllowlist`, `tool routes`, `worker targets`)
- `requestedOptimization` (ex.: `optimizationMode`, `contextPolicy`, `routingHints`, `budgetPolicyRef`)
- `policyHints` (opcional; nunca substitui policy do gateway)

### 8. `OptimizationPolicyHints` (stub/contract)
Politica parametrizavel de custo/latencia/qualidade enviada pela camada de negocio.
Campos minimos sugeridos:
- `optimizationMode` (`economy | balanced | quality | custom`)
- `contextPolicy` (`lean | standard | full`)  // contexto magro parametrizavel
- `routingHints` (ex.: `preferFast`, `preferCheap`, `allowEscalation`, `escalationThreshold`)
- `budgetPolicyRef` (id/logical key; enforcement principal pode ser externo ao gateway)
- `providerFeatureHints` (ex.: `preferPromptCaching` quando suportado)

## Pontos de integracao (onde os contratos entram)

1. Inbound websocket/gateway message handling
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server-methods.ts`

2. Handler de chat (origem, overrides e decisao de execucao)
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/types.ts`

3. Scheduler/cron/supervisor
- `src/gateway/server-methods/cron.ts`
- `src/gateway/stateless/scheduler-policy.ts`
- `src/gateway/stateless/contracts/scheduler-orchestrator.ts`

4. Swarm/delegacao
- `src/gateway/server-methods/swarm.ts`
- `src/gateway/stateless/contracts/runtime-worker-protocol.ts`
- `src/gateway/stateless/contracts/enterprise-orchestration.ts`

## Arquivos alvo (must touch)

### Contratos novos (recomendado criar)
- `src/gateway/stateless/contracts/request-context-contract.ts`
- `src/gateway/stateless/contracts/override-resolution.ts`
- `src/gateway/stateless/contracts/execution-routing.ts`
- `src/gateway/stateless/contracts/delegation-envelope.ts`
- `src/gateway/stateless/contracts/index.ts` (exports)

### Contexto e handlers existentes
- `src/gateway/server-methods/types.ts`
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/cron.ts` (tipagem/placeholder integration)
- `src/gateway/server-methods/swarm.ts` (tipagem/placeholder integration)
- `src/gateway/server-methods.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server/ws-connection/message-handler.ts`

### Protocol/schema (somente campos de envelope/contexto expostos)
- `src/gateway/protocol/schema/logs-chat.ts` (se `chat.send` schema estiver aqui)
- `src/gateway/protocol/schema/protocol-schemas.ts`
- `src/gateway/protocol/schema/types.ts`
- `src/gateway/protocol/index.ts`

### Testes (novos)
- `src/gateway/stateless/request-context-contract.test.ts`
- `src/gateway/stateless/override-resolution.test.ts`
- `src/gateway/stateless/execution-routing-contract.test.ts`
- `src/gateway/server-methods/chat.request-context.test.ts`

## Fases de execucao

### Fase 1 - Contract Design Freeze (arquitetura)
**Agente principal:** `architect-specialist`

Tarefas:
1. Inventariar tipos existentes em `GatewayRequestContext`, `EnterpriseIdentity`, overrides de `chat.send`.
2. Definir contratos novos e nomenclatura canonica (sem duplicar termos existentes).
3. Especificar matriz de merge de overrides (campos, origem, fallback, rejeicao).
4. Especificar semantica de `skillAllowlist` dinamico (intersection vs replace) e naming canonico.
5. Especificar output `ExecutionDecision` e `DelegationEnvelope`.
6. Especificar contrato `TrustedFrontdoorDispatchContext` (stub) para uso no Plan 3.
7. Especificar contrato `OptimizationPolicyHints` e semantica de fallback (sem acoplamento por provider).

Entregaveis:
- ADR curta em markdown no proprio plano (ou doc complementar)
- lista de tipos finais + exemplos JSON
- exemplos JSON cobrindo `channel_direct` e `trusted_frontdoor_api` com `skillAllowlist`
- exemplos JSON cobrindo `optimizationMode=economy` e fallback quando o hint nao vier
- matriz de compatibilidade legado vs novo

### Fase 2 - Contract Wiring (backend)
**Agente principal:** `backend-specialist`

Tarefas:
1. Criar contratos em `src/gateway/stateless/contracts/*`.
2. Expandir `GatewayRequestContext` em `server-methods/types.ts`.
3. Introduzir normalizadores/helper de request source + override patch sem ativar enforcement forte.
4. Adaptar `chat.ts` para consumir `OverrideResolution` (ou hook equivalente), mantendo compat.
5. Expor campos de envelope/contexto necessarios no schema de `chat.send` (se ja suportado pelo protocolo).
6. Garantir que `effectiveSkillAllowlist` possa ser carregado no contexto/delegacao sem enforcement completo ainda.
7. Preparar `effectiveOptimizationPolicy`/hints no contexto sem forcar uso imediato pelos handlers.

Entregaveis:
- contracts exportados
- handlers compilando e sem regressao funcional
- compatibilidade preservada para canais diretos e control UI

### Fase 3 - Validation + Handoff
**Agente principal:** `test-writer` (com `code-reviewer`)

Tarefas:
1. Testes unitarios de merge/fallback/normalizacao.
2. Testes de semantica de `skillAllowlist` (patch ausente, patch presente, fallback, contrato de interseccao placeholder).
3. Testes de merge/fallback de `optimizationMode`/`contextPolicy` (ausente => default; valor invalido => rejeicao/fallback conforme contrato).
4. Testes de compatibilidade para payload antigo de `chat.send`.
5. Atualizar docs (`architecture`, `data-flow`, `glossary`).
6. Publicar tabela de dependencias para Plans 1-3.

Entregaveis:
- testes passando
- docs atualizadas
- checklist de integração para planos paralelos

## Criterios de aceite

- Existe contrato explicito para `requestSource`, `OverridePatch`, `ExecutionDecision`, `DelegationEnvelope`.
- `GatewayRequestContext` suporta esses contratos sem quebrar handlers atuais.
- `chat.send` continua aceitando payload legado.
- Ordem de fallback/merge esta documentada e testada.
- Semantica de `skillAllowlist` dinamico (limitador por request, nao bypass de RBAC) esta documentada.
- Planos 1, 2 e 3 conseguem implementar enforcement sem redefinir tipos.

## Paralelizacao

- **Nao paralelizavel** com os outros planos durante Fase 1.
- Apos Fase 2 (contracts mergeados), Plans 1/2/3 podem avancar em paralelo.

## Riscos

- Redefinir tipos ja existentes (`enterprisePrincipal`, `tenantContext`) e quebrar testes.
- Vazar contrato de implementacao de Plan 1/2/3 para Plan 0.

Mitigacao:
- tipos novos como extensao/adicao, nao rename disruptivo
- helpers de adaptacao e campos opcionais durante migracao

## Status de execucao (implementado)

Concluido no codigo (foundation / wiring minimo, sem enforcement):
- contratos novos criados:
  - `request-context-contract.ts`
  - `override-resolution.ts`
  - `execution-routing.ts`
  - `delegation-envelope.ts`
- exports adicionados em `src/gateway/stateless/contracts/index.ts`
- `GatewayRequestContext` expandido com:
  - `requestSource`
  - `runtimeRequestEnvelope`
  - `overrideResolution`
  - `executionDecision`
  - stubs relacionados (`channelIdentity`, `trustedFrontdoorDispatch`)
- `ws message handler` passa a injetar `requestSource` default + `runtimeRequestEnvelope` base
- `chat.send` passa a usar `sanitizeOverridePatch()` + `resolveOverrideResolution()` (compativel)
- schema de `chat.send.overrides` expandido com hints opcionais de otimizacao:
  - `optimizationMode`
  - `contextPolicy`
  - `routingHints`
  - `budgetPolicyRef`

Testes adicionados:
- `src/gateway/stateless/request-context-contract.test.ts`
- `src/gateway/stateless/override-resolution.test.ts`
- `src/gateway/server-methods/chat.request-context.test.ts`

Validacao executada:
- `pnpm vitest run ...` (10 testes, todos passando)
- `pnpm tsgo` (ok)

Deliberadamente deixado para os proximos planos:
- enforcement de policy/RBAC/ABAC (Plan 1)
- roteamento real de `ExecutionDecision` (Plan 2)
- claims/envelope trusted frontdoor no protocolo `chat.send` (Plan 3)
- bloqueios/auditoria por `requestSource` (Plan 3)
