---
title: "Enterprise Runtime Plan 3: Override Source Policy And Trusted Frontdoor"
status: completed
priority: HIGH
parallelizable: partial
updated: 2026-02-23
owner: "platform-security"
---

# Plan 3: Override Source Policy And Trusted Frontdoor

## Objetivo

Definir e implementar o modelo seguro para overrides (prompt/model/token/etc.), cobrindo:
- origem da requisicao (canal direto vs portal/API trusted vs supervisor interno)
- patch parcial com fallback para defaults/config do agente
- allowlist/denylist por campo de override
- auditoria de overrides sensiveis (especialmente credenciais/BYOK)

## Dependencias

- **Depende do Plan 0** (contracts: requestSource, override patch/merge)
- **Integra com Plan 1** (principal/scopes para autorizar override)

## Escopo (inclui)

- classificacao de origem confiavel (`trusted frontdoor`) no gateway
- envelope de override (origem, campos, assinatura/contexto)
- merge canônico defaults + config de agente + session + request patch
- policy por campo (quem pode sobrescrever o que)
- bloqueio de overrides sensiveis em canais diretos
- semantica de `skillAllowlist` dinamico como limitador de capacidades (intersection, nunca bypass)
- perfis de otimizacao parametrizaveis (`economy/balanced/quality/custom`) via frontend/frontdoor, sem hardcode provider-specific no core
- auditoria/metricas de override (allow/reject)
- docs/FAQ de operacao (canais diretos vs API)

## Fora de escopo

- SSO completo do frontdoor (pode usar token/JWT assinados pela sua API primeiro)
- UI final de policy authoring (futuro)
- suporte a qualquer provider especifico (usa trilha driver/provider existente)

## Modelo de origem (contrato)

### `RequestSource` (consome Plan 0)
Usar pelo menos:
- `channel_direct`
- `trusted_frontdoor_api`
- `internal_supervisor`
- `system_job`

### `TrustedFrontdoorClaims` (novo contrato)
Campos sugeridos:
- `tenantId`
- `principalId`
- `scopes[]`
- `requestId`
- `issuedAt` / `expiresAt`
- `signature` ou token validado externamente
- `allowedOverrideFields[]` (opcional, para policy fina por request)
- `allowedCapabilities` (opcional; ex.: `skillAllowlist`, `workerTargets`, `toolRoutes` permitidos para aquele ticket)
- `frontdoorId` / `integrationId` (opcional, auditoria/origem operacional)

### `OverridePatch` (patch parcial)
Campos previstos (ajustar ao contrato real de `chat.send`):
- `provider`
- `model`
- `systemPrompt`
- `soul`
- `apiKey`
- `authProfileId`
- `skillAllowlist`
- `optimizationMode`
- `contextPolicy`
- `routingHints`
- `budgetPolicyRef` (normalmente referencia, nao valor de saldo)
- campos futuros (`temperature`, `maxTokens`, etc.)

### `CapabilityOverrideResolution` (novo, pode ser agregado em `OverrideResolution`)
Campos minimos:
- `requestedSkillAllowlist[] | null`
- `policyAllowedSkills[] | null`
- `agentDefaultSkillAllowlist[] | null`
- `effectiveSkillAllowlist[]`
- `rejectedSkills[]` (com motivo)

### `OptimizationOverrideResolution` (novo, pode ser agregado em `OverrideResolution`)
Campos minimos:
- `requestedOptimizationMode | null`
- `effectiveOptimizationMode`
- `effectiveContextPolicy`
- `effectiveRoutingHints`
- `rejectedOptimizationFields[]` (com motivo / unsupported / policy)
- `providerCapabilityAdjustments[]` (opcional; ex.: prompt caching ignorado por provider sem suporte)

## Regra de merge (obrigatoria)

Ordem de resolucao (sem ambiguidades):
1. defaults da instancia/container (ENV/runtime)
2. config do agente
3. contexto de sessao (se existir)
4. request override patch (somente campos permitidos pela origem + scopes)

### Comportamento esperado
- campo ausente no patch => usa fallback/default
- campo presente e permitido => sobrescreve
- campo presente e negado => rejeita campo ou request (policy define), sempre auditando
- `skillAllowlist` presente => aplicar **interseccao** com policy/entitlements e defaults do agente (nao replace cego)
- `optimizationMode/contextPolicy/routingHints` => tratar como **hints/politica**, com fallback para defaults do tenant/agente quando ausentes
- campos de otimizacao provider-specific devem passar por capability mapping (ignorar/ajustar quando nao suportados, sem quebrar request por padrao)

## Matriz de policy de override (primeira versao)

### Canais diretos (`channel_direct`)
- Permitido (default): nenhum override sensivel
- Opcional restrito: `systemPrompt`/`soul` somente se policy explicita permitir
- Negado: `apiKey`, `authProfileId`, `skillAllowlist` (por padrao)
  - Motivo: evitar que usuario de canal bruto reconfigure capacidades do swarm por mensagem
- `optimizationMode/contextPolicy`: opcionalmente permitidos apenas se policy explicita (caso queira expor "modo economico" ao cliente final)

### Portal/API trusted (`trusted_frontdoor_api`)
- Permitido: `provider`, `model`, `systemPrompt`, `soul` (via scopes)
- Sensivel (admin/system only): `apiKey`, `authProfileId`
- Controlado por entitlements/scopes + interseccao: `skillAllowlist`
- `optimizationMode/contextPolicy/routingHints`: permitidos como politica parametrizavel (subject to policy/tenant config)
- Sempre auditado quando houver BYOK / credenciais

### `trusted_frontdoor_api` (padrao operacional recomendado)
Fluxo canonico a suportar/documentar:
1. canal/webhook bate na API da empresa (frontdoor)
2. frontdoor identifica usuario (telefone/chatId -> principal corporativo)
3. frontdoor resolve RBAC/ABAC + entitlements
4. frontdoor monta `OverridePatch` parcial (incluindo `skillAllowlist` se aplicavel)
   - pode incluir `optimizationMode` (ex.: `economy`) e `contextPolicy=lean`
5. OpenClaw valida claims/origem e aplica merge/policy local

### Supervisor interno (`internal_supervisor`)
- Pode aplicar override no worker somente dentro de policy e com escopos propagados
- Nunca escalar privilegio alem do requisitante original sem role administrativa explicita
- `skillAllowlist` ao delegar deve ser reduzido para `effectiveSkillAllowlist` herdado/intersectado

## Arquivos alvo (must touch)

### Gateway chat / contexto / protocolo
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/types.ts`
- `src/gateway/server-methods.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server/ws-connection/message-handler.ts`
- `src/gateway/protocol/schema/logs-chat.ts` (schema do `chat.send`, se centralizado aqui)
- `src/gateway/protocol/schema/protocol-schemas.ts`
- `src/gateway/protocol/schema/types.ts`
- `src/gateway/protocol/index.ts`

### Contratos/policy (Plan 0 + implementacao)
- `src/gateway/stateless/contracts/override-resolution.ts`
- `src/gateway/stateless/contracts/request-context-contract.ts`
- `src/gateway/stateless/enterprise-authorization.ts` (consulta de scopes para campos)

### Auditoria/metricas
- `src/gateway/runtime-metrics.ts`
- `src/gateway/stateless/adapters/prisma/prisma-audit-event-store.ts` (se precisar enriquecer eventos)
- `src/gateway/server-methods/chat-portal.ts` (se houver ponto de entrada trusted frontdoor/control portal para claims/contexto)
- `src/gateway/server-methods/providers.ts` / `drivers.ts` (somente se capability mapping de provider/model for consultado no merge; evitar acoplamento forte)

### Testes
- `src/gateway/server-methods/chat.abort-persistence.test.ts` (expandir BYOK/override)
- `src/gateway/server-methods/chat.override-policy.test.ts` (novo)
- `src/gateway/server-methods/chat.trusted-frontdoor.test.ts` (novo)
- `src/gateway/protocol/index.test.ts` (schema compat)

## Fases de execucao

### Fase 1 - Policy/Contract Freeze
**Agente principal:** `architect-specialist` + `security-auditor`

Tarefas:
1. Congelar matriz de campos de override por `RequestSource`.
2. Definir comportamento de erro: reject request vs reject field.
3. Definir contrato do trusted frontdoor (`claims` / token / metadata) e como entra no gateway.
4. Definir eventos de auditoria e metricas.
5. Definir eventos especificos para `skillAllowlist` (requested/reduced/rejected) e BYOK via frontdoor.
6. Definir estrategia para `optimizationMode` como hint parametrizavel (permitir/ignorar/reduzir por capability), evitando regras rigidas no core.

Entregaveis:
- tabela de policy por campo/origem
- contrato `TrustedFrontdoorClaims`
- catalogo de eventos de auditoria
- exemplos de payload "frontdoor dispatcher" (webhook -> OpenClaw) sem segredos reais
- tabela de mapeamento de capacidades (ex.: caching suportado vs nao suportado) como comportamento de degradacao graciosa

### Fase 2 - Implementacao no Gateway
**Agente principal:** `backend-specialist`

Tarefas:
1. Implementar classificacao de origem no request context.
2. Implementar merge resolver com fallback parcial.
3. Implementar enforcement por campo usando scopes/policy.
4. Integrar trusted frontdoor claims no `chat.send` (sem quebrar canais diretos).
5. Bloquear overrides sensiveis em `channel_direct` por padrao.
6. Implementar resolucao de `effectiveSkillAllowlist` (interseccao) e auditoria de reducoes/rejeicoes.
7. Implementar resolucao de `OptimizationOverrideResolution` (fallback + capability mapping + degradacao graciosa).

Entregaveis:
- `chat.send` com merge/policy auditavel
- compatibilidade com requests sem override
- logs/metricas de allow/reject

### Fase 3 - Testes + Docs + Operacao
**Agente principal:** `test-writer` + `documentation-writer`

Tarefas:
1. Testar patch parcial (campo ausente => fallback).
2. Testar trusted frontdoor vs canal direto.
3. Testar BYOK/admin scope e auditoria de accepted/rejected.
4. Testar `skillAllowlist` dinamico (allow, reduction by policy, reject from channel_direct).
5. Testar cenario B2B2C pooling (requests concorrentes de tenants distintos com overrides diferentes sem vazamento de config/capabilities).
6. Testar `optimizationMode=economy` parametrizado via trusted frontdoor e fallback em providers sem feature equivalente.
7. Testar canais diretos sem `optimizationMode` (default) e com `optimizationMode` quando policy permitir.
8. Atualizar FAQ e guias operacionais com exemplos reais de fluxo.

Entregaveis:
- suite de override policy
- docs para operadores e integradores de portal/API
- exemplos de payloads recomendados (sem segredos reais)

## Criterios de aceite

- Override e patch parcial com fallback automatico para defaults/config do agente.
- Canais diretos continuam funcionando sem override sensivel.
- Trusted frontdoor aplica overrides autorizados com auditoria.
- `skillAllowlist` dinamico funciona como limitador de capacidades, nunca como bypass de policy.
- `optimizationMode`/otimizadores sao parametrizaveis via frontend/frontdoor e degradam graciosamente quando provider/capability nao suportar.
- Campos negados geram erro/rejeicao clara e metrificada.
- BYOK/credenciais por request exigem scopes adequados e nao vazam segredos em logs.

## Paralelizacao

- Pode rodar em paralelo com Plan 1 apos Plan 0.
- Pode rodar em paralelo parcial com Plan 2, desde que compartilhe `RequestSource` e `DelegationEnvelope` sem redefinicoes locais.

## Riscos e mitigacoes

- **Risco:** implementar override policy diretamente em `chat.ts` sem camada de merge reusavel.
  - **Mitigacao:** contrato/helper `override-resolution` dedicado.
- **Risco:** trusted frontdoor virar bypass de autorizacao.
  - **Mitigacao:** claims validados + scopes + audit + policy por campo.

## Status de execucao (progresso atual)

Implementado (recorte funcional do Plan 3):
- `chat.send` aceita `requestContext` opcional com:
  - `requestSource`
  - `trustedFrontdoor` (claims/metadata basicos)
- policy de override por `requestSource` aplicada antes da execucao:
  - `channel_direct` bloqueia por padrao `apiKey`, `authProfileId`, `skillAllowlist` e hints de otimizacao
  - `trusted_frontdoor_api` suporta filtro adicional por `claims.allowedOverrideFields`
- matriz baseline de comportamento:
  - `reject request` para BYOK sensivel em `channel_direct`
  - `reject field` (degradacao) para hints de otimizacao e campos nao permitidos por `allowedOverrideFields`
- `chat.send` agora popula `context.trustedFrontdoorDispatch` e atualiza `context.requestSource` por request
- validacao baseline de claims trusted frontdoor:
  - claims obrigatorios quando `requestSource=trusted_frontdoor_api`
  - rejeita claims expirados
  - rejeita `issuedAt` muito no futuro
- auditoria best-effort para campos de override rejeitados e reducao de `skillAllowlist`
- metricas adicionadas para:
  - trusted frontdoor requests
  - override field/request rejected
  - `skillAllowlist` reduced
- schema `chat.send` expandido com `requestContext` (compativel/optional)

Testes adicionados:
- `chat.override-policy.test.ts`
- `chat.trusted-frontdoor.test.ts`

Validacao executada nesta etapa:
- suites de `chat.override-policy`, `chat.trusted-frontdoor` e regressao `chat.abort-persistence` passando

Nota operacional (multi-agent):
- `pnpm tsgo` global ficou temporariamente quebrado por alteracoes paralelas dos Plans 1/2 (modelos Prisma/contratos de delegacao em progresso), nao por regressao deste recorte do Plan 3

Follow-ups (fora do fechamento baseline deste plano):
- policy fina por scopes/entitlements (integracao com Plan 1 quando estabilizar)
- claims validation mais forte (TTL/signature/JWT strategy)
- regras de degradacao/capability mapping mais completas para otimizadores
- consolidacao final em `architecture.md`, `data-flow.md` e `security.md` apos merge dos Plans 1/2

Documentacao entregue nesta etapa:
- `.context/docs/trusted-frontdoor-overrides-guide.md`
  - payloads canonicos `chat.send`
  - fluxo `trusted_frontdoor_api`
  - regra `reject request` vs `reject field`
  - `skillAllowlist` como limitador
  - `optimizationMode=economy` como hint parametrizavel + alternativas sem modelo local
