---
title: "Enterprise Runtime Governance Master Plan"
status: in_progress
priority: CRITICAL
parallelizable: partial
updated: 2026-02-23
owner: "platform-architecture"
---

# Enterprise Runtime Governance Master Plan

## Objetivo

Fechar os gaps de arquitetura revelados nas discussoes recentes sobre:

- diferenca entre execucao direta vs filas/Temporal
- workers internos sem canal (sem WhatsApp/Telegram) e com provider/modelo proprio
- autorizacao de usuarios por identidade corporativa (nao apenas telefone)
- origem confiavel de overrides (prompt/model/token) e merge por fallback
- propagacao de contexto do requisitante ao supervisor e aos workers

## Problemas identificados (resumo das ultimas conversas)

1. Nem toda tarefa deve passar por Temporal/BullMQ/Redis.
2. Worker especializado pode ser invocado apenas por supervisor/manager e nao precisa canal.
3. Telefone/canal identifica origem, mas nao resolve permissao fina (RBAC/ABAC).
4. Overrides via canal direto sao ambiguos/inseguros sem uma camada trusted frontdoor.
5. Merge de defaults + config de agente + request override precisa contrato canônico e auditavel.
6. `skillAllowlist` dinamico por request precisa semantica canonica (patch + policy + interseccao de permissoes).
7. Falta contrato explicito para o padrao "trusted frontdoor dispatcher" (webhook -> identificacao -> payload builder -> RPC).
8. Otimizacao de custo/tokens (roteamento, contexto magro, budgets, caching) precisa virar politica parametrizavel, nao regra fixa no core.

## Resultado esperado (programa)

Ao final desta trilha, o sistema deve permitir:

- decidir modo de execucao (inline / redis-ephemeral / temporal) por policy e tipo de tarefa
- delegar tarefas supervisor -> worker com contrato e controles de permissao
- mapear usuario de canal para identidade corporativa e scopes efetivos
- aplicar overrides apenas quando a origem e trusted e com policy por campo
- aplicar `skillAllowlist` dinamico por request como limitador de capacidades (sem bypass de RBAC/ABAC)
- usar fallback automatico (request patch parcial) sem perder defaults
- suportar perfis de execucao/otimizacao (ex.: `economy`, `balanced`, `quality`) vindos do frontend/frontdoor sem acoplar a um provider especifico

## Planos filhos (trilha)

1. `enterprise-runtime-plan-0-contracts-and-request-context.md`
- Congela contratos canonicos entre canal, gateway, supervisor, worker e scheduler.
- **Pre-requisito para os demais**.

2. `enterprise-runtime-plan-1-identity-rbac-abac-and-channel-mapping.md`
- Identidade corporativa + mapeamento canal -> usuario + RBAC/ABAC.

3. `enterprise-runtime-plan-2-supervisor-worker-delegation-and-execution-routing.md`
- Delegacao supervisor/worker + politica de roteamento inline vs Redis/BullMQ vs Temporal.

4. `enterprise-runtime-plan-3-override-source-policy-and-trusted-frontdoor.md` ✅ baseline concluido
- Origem confiavel de overrides + merge defaults/agent/request + policy de campos.

5. `enterprise-runtime-plan-4-admin-direct-worker-invoke-backend.md`
- Fecha o RPC operacional para `admin/supervisor -> worker` usando a fundacao do Plan 2.

6. `enterprise-runtime-plan-5-swarm-worker-presence-and-control-ui.md`
- Completa a UX operacional do painel de swarm (presenca/online + validar/invocar worker).

## Contratos globais que precisam existir (cross-plan)

### 1. Request Context Canonico
Consumido por `chat`, `swarm`, `cron`, `skills`, `sessions`, `nodes`, memory/tools.

Campos minimos:
- `requestSource`: `channel_direct | trusted_frontdoor_api | internal_supervisor | system_job`
- `channelIdentity` (quando vier de canal)
- `enterprisePrincipal` (identidade corporativa resolvida)
- `tenantContext`
- `overrideEnvelope` (patch + origem + policy result)
- `executionDecision` (inline/redis/temporal)

### 2. Delegation Envelope
Supervisor -> Worker (sem canal) com propagacao de autorizacao:
- `delegatedBy`
- `originalRequester`
- `effectiveScopes`
- `taskContract`
- `executionMode`
- `trace/audit ids`

### 3. Override Merge Contract
Ordem de resolucao:
1. defaults da instancia/container
2. config do agente
3. contexto de sessao (quando aplicavel)
4. request override patch (campos permitidos)
5. enforcement/audit final

### 4. Capability Constraint Contract (cross-plan)
`skillAllowlist` e restricoes dinamicas similares devem seguir semantica unica:
- `requestedSkillAllowlist` (patch por request)
- `policyAllowedSkills` (RBAC/ABAC / entitlements)
- `effectiveSkillAllowlist = intersection(requestedSkillAllowlist?, policyAllowedSkills, agent/tool defaults)`
- regras de fallback quando o patch nao vier

### 5. Trusted Frontdoor Dispatch Contract (cross-plan)
Fluxo canonico para integracao enterprise:
1. webhook/canal bate na API da empresa (nao direto no motor, quando houver policy de negocio)
2. API resolve identidade + plano + role + entitlements
3. API monta request para OpenClaw (`override patch` + contexto trusted)
4. Gateway valida origem/claims e aplica merge/policy

### 6. Optimization Policy Profile Contract (cross-plan)
Configuracoes de custo/latencia/qualidade devem ser tratadas como **politica parametrizavel**.
Exemplos de sinais:
- `optimizationMode`: `economy | balanced | quality | custom`
- `routingHints` (prefer cheap/fast model, fallback chain, task complexity)
- `contextPolicy` (contexto magro vs normal)
- `budgetPolicyRef` (limites de custo/taxa, enforced no frontdoor e/ou gateway)
- `providerFeatures` (prompt caching suportado, etc.) como capacidades, nao obrigacao

## Paralelizacao (planejada)

### Sequencia recomendada
1. **Plan 0** (contratos e pontos de injecao)
2. **Plan 1 + Plan 3** em paralelo (consomem contratos do Plan 0)
3. **Plan 2** em paralelo parcial com Plan 1/3 apos Plan 0
4. Hardening + docs finais por plano

### Paralelo seguro (2-3 agentes)
- **Agente A (arquitetura/backend):** Plan 0
- **Agente B (backend-security):** Plan 1
- **Agente C (backend-orchestration):** Plan 2
- **Agente D (backend/api + docs):** Plan 3 (pode rodar em paralelo apos freeze do Plan 0)

### Dependencias cruzadas (obrigatorias)
- Plan 1 e Plan 3 **nao** devem redefinir tipos de request context por conta propria.
- Plan 2 **nao** deve hardcode de scheduler/queue sem usar `ExecutionDecision` definido no Plan 0.
- Plan 3 **nao** deve aplicar override sensivel sem consultar policy/authorization de Plan 1.

## Guardrails de implementacao (para nao quebrar o que ja foi feito)

### Nao mexer sem necessidade
- `driver-provider-plan-*` (Planos 0-3) concluídos, exceto extensoes explicitamente citadas
- runtime de drivers/providers e UI `/drivers` (usar como base, nao refatorar globalmente)
- `front-plan-*` ja fechado (evitar churn em rotas nao relacionadas)
- `enterprise-runtime-plan-2-*` (considerar como fundacao de policy/invoker; nao reabrir escopo inteiro para entregar RPC/UI faltantes)

### Arquivos base (alto risco; mudancas devem ser pequenas e revisadas)
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/types.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/protocol/schema/protocol-schemas.ts`
- `src/gateway/protocol/schema/types.ts`

### Estrategia de mudanca
- adicionar contratos/handlers novos antes de substituir comportamentos existentes
- preservar compatibilidade de `chat.send` e canais diretos durante migracao
- introduzir feature flags para trusted frontdoor/strict auth quando necessario

## Entregaveis de documentacao (obrigatorios)

- Atualizar `.context/docs/architecture.md` com fluxo canal -> principal -> authz -> delegation/execution.
- Atualizar `.context/docs/data-flow.md` com modos inline/redis/temporal.
- Atualizar `.context/docs/security.md` com policy de overrides e trusted sources.
- Criar guia de operacao para "canais diretos vs portal/API trusted".
- Atualizar `.context/docs/faq-enterprise-ops.md` com perguntas de permissao, overrides e workers internos.

## Criterios de pronto do programa (trilha)

1. Usuario autenticado por canal/portal e resolvido para identidade corporativa com scopes.
2. Supervisor delega para worker sem canal com propagacao de contexto e auditoria.
3. Sistema escolhe inline/Redis/BullMQ/Temporal por policy audivel.
4. Overrides sao patch parcial com fallback para defaults, com allowlist por origem.
5. Canais diretos permanecem funcionais, mas com restricao de overrides sensiveis.
6. Docs/FAQ explicam claramente os fluxos e limites.
7. Cenario B2B2C pooling (multiplos tenants no mesmo swarm) tem testes/docs cobrindo isolamento por contexto/override.

## Riscos e mitigacoes

- **Risco:** sobreposicao entre planos alterando `chat.ts` ao mesmo tempo.
  - **Mitigacao:** Plan 0 primeiro + dividir areas por funcao (context merge / authz / execution routing).
- **Risco:** regressao em canais legados.
  - **Mitigacao:** testes de smoke por canal e feature flags de rollout gradual.
- **Risco:** policy de permissao virar hardcode por cliente.
  - **Mitigacao:** contratos + store central + ABAC declarativo.
- **Risco:** `skillAllowlist` dinamico ser tratado como bypass de autorizacao.
  - **Mitigacao:** semantica de interseccao obrigatoria + auditoria de campos rejeitados.
- **Risco:** taticas de token optimization virarem comportamento rigido no core e quebrarem agnosticismo.
  - **Mitigacao:** modelar como `optimizationMode`/policy hints opcionais, com fallback seguro e sem acoplamento a provider.

## Evidencias para rastreabilidade

Cada plano filho deve produzir:
- diff de contratos e handlers
- testes unitarios/integracao/negativos
- atualizacao de docs associadas
- notas de rollout/flags/env relevantes
