---
title: "Enterprise Runtime Plan 1: Identity RBAC ABAC And Channel Mapping"
status: pending
priority: CRITICAL
parallelizable: partial
updated: 2026-02-23
owner: "platform-security"
---

# Plan 1: Identity RBAC ABAC And Channel Mapping

## Objetivo

Implementar a camada enterprise de identidade/autorizacao para resolver o gap:
- telefone/canal identifica origem, mas nao define permissoes de negocio

Este plano cria a base para dizer:
- quem e o usuario corporativo
- quais habilidades/workers/tools/memorias ele pode usar
- como esse contexto e propagado para supervisor/worker

## Dependencia

- **Depende do Plan 0** (contratos de request context e principal ref).

## Escopo (inclui)

- mapeamento `channel identity -> enterprise principal`
- provisioning de bindings/entitlements (API interna e/ou CLI operacional)
- RBAC/ABAC para capacidades (tools, swarm workers, memory domains, relatorios)
- entitlements/capability bundles para derivar limites dinamicos por request (ex.: `policyAllowedSkills`)
- enforcement em handlers de gateway (chat/swarm/cron/sessions/skills/nodes quando aplicavel)
- propagacao de `effectiveScopes` para delegacao supervisor->worker
- auditoria de denies e decisions sensiveis
- testes cross-tenant + cross-role
- docs de seguranca e operacao

## Fora de escopo

- UI completa de administracao de usuarios/permissoes (pode entrar em plano futuro)
- SSO/OIDC completo com provider especifico (deixar contratos preparados)
- provisioning externo (SCIM/IdP sync)

## Contratos e entidades (obrigatorios)

### 1. `ChannelIdentityBinding`
Mapeia identidade tecnica de canal para principal enterprise.
Campos sugeridos:
- `tenantId`
- `channelId` (whatsapp/telegram/slack/...)
- `accountId`
- `subjectId` (telefone/jid/user id)
- `principalId`
- `status` (`active|disabled`)
- `attributes` (label, source, verifiedAt)

### 2. `EnterprisePrincipal`
Ja existe parcialmente; consolidar contrato final consumido no gateway:
- `tenantId`
- `principalId`
- `role`
- `scopes[]`
- `attributes` (department, team, region, employmentType)

### 3. `AuthorizationTarget`
Padrao unico de alvo para policy engine:
- `kind`: `tool | skill | swarm_worker | memory_scope | cron | model_route | report_domain`
- `id`
- `tenantId`
- `attributes`

### 3.1 `CapabilityEntitlements` (recomendado)
Contrato derivado de role/grants/plano, usado pelo merge de overrides (Plan 3).
Campos sugeridos:
- `allowedSkills[]`
- `allowedWorkers[]`
- `allowedToolRoutes[]`
- `allowedModelRoutes[]` (opcional)
- `constraints`

### 4. `AccessDecision`
- `allowed`
- `reasonCode`
- `reasonMessage`
- `matchedPolicyId` (opcional)
- `effectiveScopes[]`
- `constraints` (filters/row scopes/domain scopes)

### 5. `DelegatedCallerContext`
Contexto propagado ao worker:
- `originalRequesterPrincipal`
- `delegatedByPrincipal`
- `effectiveScopes[]`
- `constraints`
- `trace`

## Arquitetura de policy (recomendada)

### Camadas
1. **Identity resolution** (mapeamento canal/API -> principal)
2. **Policy evaluation** (RBAC + ABAC)
3. **Handler enforcement** (chat/swarm/cron/...)
4. **Propagation** (supervisor -> worker)
5. **Audit** (allow/deny em casos sensiveis)

### Relacao com `skillAllowlist` dinamico (Plan 3)
- `skillAllowlist` vindo por override trusted nao cria permissao nova
- `effectiveSkillAllowlist` = interseccao entre request, defaults do agente e `CapabilityEntitlements.allowedSkills`

### Regras iniciais para cobrir suas duvidas
- `finance reports` exigem escopo dedicado (ex.: `reports:finance:read`)
- time de vendas nao pode invocar worker financeiro
- supervisor pode delegar somente para workers do time dele
- worker recebe `effectiveScopes` reduzidos (nao escalados)

## Arquivos alvo (must touch)

### Persistencia/modelos (se Prisma stateless enterprise for base)
- `prisma/schema.prisma` (novos modelos de binding/role/grant/policy)
- `src/gateway/stateless/adapters/prisma/*` (novos stores/repositories de identidade/policy)
- `src/gateway/stateless/contracts/index.ts`

### Contratos/servicos de autorizacao
- `src/gateway/stateless/enterprise-authorization.ts`
- `src/gateway/stateless/enterprise-authorization.test.ts`
- `src/gateway/stateless/contracts/enterprise-orchestration.ts` (propagacao de caller context, se couber)
- `src/gateway/stateless/contracts/request-context-contract.ts` (consumo do Plan 0)

### Inbound context resolution
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server-methods/types.ts`

### Provisioning/admin API (novo ou expandido)
- `src/gateway/server-methods/nodes.ts` (somente se reaproveitar namespace administrativo)
- `src/gateway/server-methods/*identity*.ts` (novo, recomendado)
- `src/gateway/server-methods/*authz*.ts` (novo, recomendado)
- `src/gateway/protocol/schema/*` (schemas dos RPCs de provisioning)

### Handlers com enforcement
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/swarm.ts`
- `src/gateway/server-methods/cron.ts`
- `src/gateway/server-methods/sessions.ts`
- `src/gateway/server-methods/skills.ts`
- `src/gateway/server-methods/nodes.ts` (onde houver acao sensivel)

### Auditoria/metricas
- `src/gateway/runtime-metrics.ts`
- `src/gateway/stateless/adapters/prisma/prisma-audit-event-store.ts` (se precisar novos eventos)

### Testes (novos/expansao)
- `src/gateway/stateless/enterprise-authorization.test.ts` (expandir)
- `src/gateway/stateless/cross-tenant-isolation.test.ts` (expandir)
- `src/gateway/server-methods/swarm.test.ts`
- `src/gateway/server-methods/cron.temporal-scheduling-policy.test.ts`
- `src/gateway/server-methods/chat.abort-persistence.test.ts` (negative auth/override interactions)

## Fases de execucao

### Fase 1 - Identity Mapping + Policy Model
**Agente principal:** `architect-specialist` + `database-specialist`

Tarefas:
1. Definir modelo de binding `channel -> principal` e grants/policies.
2. Definir escopos padrao por role (`admin`, `manager/supervisor`, `worker`, `employee`, etc.).
3. Definir atributos ABAC minimos (department/team/domain classification).
4. Definir contrato de propagacao `effectiveScopes` para worker.
5. Definir derivacao de `CapabilityEntitlements` (incluindo `allowedSkills`) por role/grants.
6. Definir superficie minima de provisioning (RPC/CLI) para cadastrar usuarios autorizados e bindings de canal.

Entregaveis:
- matriz de escopos por role
- schema draft (Prisma + contratos)
- tabela de alvos autorizaveis (`AuthorizationTarget.kind`)
- especificacao de `CapabilityEntitlements` e alimentacao de `effectiveSkillAllowlist`

### Fase 2 - Enforcement no Gateway
**Agente principal:** `backend-specialist`

Tarefas:
1. Resolver principal a partir de `channelIdentity` / origem trusted.
2. Integrar policy engine em handlers sensiveis.
3. Aplicar restricoes de memory/tools/swarm por `AccessDecision`.
4. Expor `CapabilityEntitlements` / `policyAllowedSkills` para consumo do merge de overrides (Plan 3).
5. Propagar `effectiveScopes` em delegacao (stub completo, execution pode ser Plan 2).
6. Registrar audit logs de denies (e allows sensiveis quando necessario).
7. Implementar RPCs administrativos minimos para:
   - cadastrar/atualizar principal
   - vincular canal (telefone/subject) a principal
   - gerenciar scopes/grants basicos

Entregaveis:
- principal resolvido em `GatewayRequestContext`
- denies consistentes com `reasonCode`
- integracao com handlers existentes sem quebra de compat
- caminho operacional para cadastrar usuarios autorizados (mesmo que sem UI dedicada)

### Fase 3 - Tests + Docs + Rollout Guardrails
**Agente principal:** `test-writer` + `documentation-writer`

Tarefas:
1. Cobrir cenarios: vendas vs financeiro, tenant A vs tenant B, supervisor vs worker.
2. Documentar fluxo de autorizacao em `security.md` e `data-flow.md`.
3. Documentar onboarding operacional de usuarios autorizados (manual/API).
4. Adicionar flag de rollout se enforcement estrito precisar ser gradual.

Entregaveis:
- suite de testes negativos/positivos
- docs operacionais
- checklist de rollout por tenant

## Criterios de aceite

- Telefone/canal e resolvido para `EnterprisePrincipal` quando houver binding.
- Sem binding, sistema cai em modo restrito/anonimo documentado (sem permissoes sensiveis).
- Enforcements de `swarm`, `cron` e `chat/tool access` usam policy central.
- Delegacao para worker carrega `effectiveScopes` do requisitante.
- `policyAllowedSkills` / entitlements alimentam `effectiveSkillAllowlist` sem escalar privilegios.
- Caso financeiro vs vendas e testado e bloqueado corretamente.

## Paralelizacao

- Pode rodar em paralelo com **Plan 3** apos freeze do Plan 0.
- Pode rodar em paralelo parcial com **Plan 2**, desde que Plan 2 consuma contratos/stubs e nao redefina policy engine.

## Riscos e mitigacoes

- **Risco:** policy espalhada por handlers sem centralizacao.
  - **Mitigacao:** `AuthorizationTarget` + `AccessDecision` unico.
- **Risco:** regressao em usuarios legacy sem binding.
  - **Mitigacao:** modo fallback restrito + logs + rollout gradual.
