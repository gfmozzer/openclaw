---
title: "Driver/Provider Plan 0: Domain Separation and Backward Compatibility"
status: in_progress
priority: CRITICAL
parallelizable: no
updated: 2026-02-22
owner: "platform-architecture"
---

# Plan 0: Domain Separation and Compatibility

## Objetivo

Separar formalmente `driver` de `provider` no dominio sem quebrar runtime existente.

## Escopo tecnico

1. Modelo de dominio
- Introduzir tipos de dominio:
  - `DriverId`
  - `ProviderId`
  - `ModelRouteId` (`driver/provider/model`)
- Mapear compatibilidade com formato legado (`provider/model`).

2. Config schema (compativel)
- Evoluir schema para aceitar:
  - formato antigo (`provider/model`)
  - formato novo (`driver/provider/model`)
- Normalizacao central para converter legados em `driver=native`.

3. Contratos internos
- Atualizar componentes de selecao de modelo para trabalhar com `driver` explicito.
- Garantir que fallback/model-selection preserve comportamento legado.

4. Observabilidade
- Expandir payloads de metricas/logs para incluir `driverId`.

## Arquivos alvo (estimado)

- `src/config/types.models.ts`
- `src/config/zod-schema.core.ts`
- `src/agents/model-selection.ts`
- `src/agents/model-catalog.ts`
- `src/gateway/server-methods/chat.ts` (metadados de execucao)

## Testes

1. Unit
- normalizacao de `provider/model` -> `native/provider/model`.
- parser de novo formato sem regressao.

2. Regressao
- fluxos antigos continuam funcionando sem config nova.

## Criterio de aceite

- Codigo aceita ambos formatos.
- Sem quebra em agentes antigos.
- Eventos/runtime passam a expor `driverId`.

## Progresso (2026-02-22)

- Entrega 1 concluida:
  - Novo dominio de rota em `src/agents/model-route.ts`.
  - Formato canonico suportado: `driver::provider/model`.
  - Compatibilidade mantida para legado `provider/model`.
  - Helpers de serializacao e chave de rota adicionados.
  - Observabilidade inicial no startup (`driverId` + `modelRoute`) em `src/gateway/server-startup-log.ts`.
  - Comentarios/schema help atualizados para explicitar formato novo + legado.
  - Teste novo: `src/agents/model-route.test.ts` (5/5).
  - `parseModelRef` passou a aceitar formato canônico `driver::provider/model` e reduzir para provider/model legado.
  - Teste novo: `src/agents/model-selection.route.test.ts` (2/2).

- Validacao:
  - `pnpm vitest run src/agents/model-route.test.ts` -> OK
  - `pnpm vitest run src/agents/model-selection.route.test.ts src/agents/model-route.test.ts` -> OK
  - `pnpm tsgo` -> OK

- Entrega 2 concluida:
  - Sessoes agora expõem rota de modelo sem quebrar compatibilidade:
    - `modelDriver` (novo, default `native`)
    - `modelRoute` (novo, formato canônico amigavel)
    - `modelProvider`/`model` (legado, mantido)
  - Tipos atualizados em `src/gateway/session-utils.types.ts`:
    - `GatewaySessionsDefaults`
    - `GatewaySessionRow`
    - `SessionsPatchResult.resolved`
  - Resolver novo em `src/gateway/session-utils.ts`:
    - `resolveSessionModelRoute(...)` (com parse de `driver::provider/model` + fallback legado).
  - `sessions.list` e `sessions.patch` passaram a retornar metadados de driver/rota.
  - Testes novos/atualizados:
    - `src/gateway/session-utils.test.ts` (novos casos para rota explícita e fallback nativo).

- Validacao adicional:
  - `pnpm vitest run src/gateway/session-utils.test.ts src/agents/model-route.test.ts src/agents/model-selection.route.test.ts` -> OK (47/47)
  - `pnpm tsgo` -> OK

- Entrega 3 concluida:
  - Observabilidade de runtime no `chat.send` agora propaga rota de modelo com driver:
    - `modelDriver`
    - `modelProvider`
    - `model`
    - `modelRoute` (canonico com driver explicito)
  - Eventos de bus atualizados com metadados de rota:
    - `chat.started`
    - `chat.final`
    - `chat.error`
  - Auditoria BYOK enriquecida com:
    - `metadata.driverId`
    - `metadata.modelRoute`
  - Compatibilidade preservada:
    - contratos legados (`modelProvider` + `model`) continuam intactos.

- Validacao adicional (entrega 3):
  - `pnpm tsgo` -> OK
  - `pnpm vitest run src/gateway/server-chat.agent-events.test.ts src/gateway/server-methods/chat.abort-persistence.test.ts src/gateway/server-methods/chat-portal.test.ts` -> OK (21/21)

- Entrega 4 concluida:
  - Catalogo de modelos agora inclui metadados de rota no dominio:
    - `driverId` (default `native`)
    - `modelRoute` (canonico com driver explicito)
  - Implementacao em `src/agents/model-catalog.ts` sem quebra de contratos existentes.
  - Testes ajustados para validar o novo shape em `src/agents/model-catalog.test.ts`.

- Validacao adicional (entrega 4):
  - `pnpm vitest run src/agents/model-catalog.test.ts src/agents/model-selection.route.test.ts src/agents/model-route.test.ts` -> OK (10/10)
  - `pnpm vitest run src/gateway/server-chat.agent-events.test.ts src/gateway/server-methods/chat.abort-persistence.test.ts src/gateway/server-methods/chat-portal.test.ts` -> OK (21/21)
  - `pnpm tsgo` -> OK
