---
title: "Driver/Provider Plan 1: Runtime Driver Loader and Env Gating"
status: completed
priority: CRITICAL
parallelizable: partial
updated: 2026-02-22
owner: "platform-runtime"
---

# Plan 1: Runtime Loader and Env Gating

## Objetivo

Permitir que cada instancia carregue apenas os drivers habilitados no env.

## Escopo tecnico

1. Driver registry no runtime
- Criar `driver-registry` com:
  - drivers built-in (native, litellm)
  - opcional de drivers externos via dynamic import.

2. Contrato de ambiente
- Implementar leitura de:
  - `OPENCLAW_DRIVERS_ENABLED`
  - `OPENCLAW_DRIVER_DEFAULT`
  - `OPENCLAW_DRIVER_<ID>_ENABLED`
  - `OPENCLAW_DRIVER_<ID>_ENTRY`
  - `OPENCLAW_DRIVER_<ID>_PACKAGE`
- Modo fail-fast quando route exige driver nao carregado.

3. Politica de isolamento por container
- Garantir que instancia sem driver X nao expose modelos/rotas de X.
- Integrar status no `chat.portal.stack.status` para visibilidade operacional.

4. Auditoria de boot
- Log estruturado de:
  - drivers habilitados
  - drivers carregados com sucesso
  - drivers falhos e motivo

## Arquivos alvo (estimado)

- `src/gateway/server-startup.ts`
- `src/gateway/server.impl.ts`
- `src/gateway/server-methods/chat-portal.ts`
- `src/agents/*` (loader/registry novos)
- `.env`/docs de tooling

## Testes

1. Unit
- parser de env e resolucao final de drivers.

2. Integration
- instancia A (`native`) nao lista rotas de `litellm`.
- instancia B (`native,litellm`) lista ambos.

## Criterio de aceite

- Driver loading controlado por env.
- Behavior previsivel em swarm por container.
- Observabilidade clara de carregamento.

## Progresso (2026-02-22)

- Entrega 1 concluida:
  - Novo resolver de runtime de drivers em `src/agents/driver-runtime.ts` com suporte a:
    - `OPENCLAW_DRIVERS_ENABLED`
    - `OPENCLAW_DRIVER_DEFAULT`
    - `OPENCLAW_DRIVER_<ID>_ENABLED`
    - `OPENCLAW_DRIVER_<ID>_ENTRY`
    - `OPENCLAW_DRIVER_<ID>_PACKAGE`
  - Regra atual:
    - built-ins (`native`, `litellm`) carregam quando habilitados;
    - externos habilitados aparecem como `enabled` + `failed` com motivo explícito (loader externo ainda não ativado).
  - `chat.portal.stack.status` passa a expor bloco `drivers` com:
    - `defaultDriver`
    - `enabled`
    - `loaded`
    - `failed`
  - Auditoria de boot adicionada em `src/gateway/server.impl.ts`:
    - log de default/enabled/loaded
    - warn por driver habilitado não carregado.

- Testes:
  - Novo: `src/agents/driver-runtime.test.ts` (4 casos de env gating)
  - Atualizado: `src/gateway/server-methods/chat-portal.test.ts`

- Validacao:
  - `pnpm vitest run src/agents/driver-runtime.test.ts src/gateway/server-methods/chat-portal.test.ts` -> OK (6/6)
  - `pnpm tsgo` -> OK

- Entrega 2 concluida:
  - Modo `fail-fast` implementado no `chat.send`:
    - quando a rota selecionada exigir `driver` nao carregado na instancia, a requisicao falha imediatamente com `INVALID_REQUEST`;
    - payload de erro inclui detalhes operacionais (`modelRoute`, `loadedDrivers`, `enabledDrivers`, `reason`).
  - Cobertura de teste adicionada em:
    - `src/gateway/server-methods/chat.abort-persistence.test.ts`
      - caso: bloqueio de `litellm::openai/gpt-4o-mini` com `OPENCLAW_DRIVERS_ENABLED=native`.

- Validacao adicional:
  - `pnpm vitest run src/gateway/server-chat.agent-events.test.ts src/gateway/server-methods/chat.abort-persistence.test.ts` -> OK (20/20)
  - `pnpm vitest run src/gateway/server-methods/chat-portal.test.ts src/agents/driver-runtime.test.ts` -> OK (6/6)
  - `pnpm tsgo` -> OK

- Entrega 3 concluida:
  - Isolamento por driver aplicado tambem aos RPCs de providers:
    - `providers.registry.list` conta apenas modelos de drivers carregados.
    - `providers.models.list` retorna apenas modelos de drivers carregados.
    - `providers.credentials.test` valida contra catalogo filtrado por drivers carregados.
  - Implementado em:
    - `src/gateway/server-methods/providers.ts` (filtro `filterCatalogByLoadedDrivers`).
  - Cobertura de testes:
    - `src/gateway/server-methods/providers.test.ts`:
      - `handler counts only models from loaded drivers`
      - `handler hides models from unloaded drivers`

- Validacao entrega 3:
  - `pnpm vitest run src/gateway/server-methods/providers.test.ts src/gateway/server-methods/chat.abort-persistence.test.ts` -> OK (42/42)
  - `pnpm tsgo` -> OK

- Entrega 4 concluida:
  - Preload real de drivers externos implementado:
    - `preloadExternalDrivers()` com import dinamico via `OPENCLAW_DRIVER_<ID>_ENTRY` ou `_PACKAGE`.
    - cache por fingerprint de env para evitar recomputo e inconsistencias.
    - hard gate para driver externo: so e considerado quando `OPENCLAW_DRIVER_<ID>_ENABLED=1/true`.
  - Runtime de drivers atualizado:
    - `resolveDriverRuntime()` passa a usar resultado do preload para marcar driver externo como `loaded/failed`.
    - helper de testes `resetDriverRuntimeCacheForTest()` adicionado.
  - Startup do gateway atualizado:
    - preload executado no boot antes do resumo operacional.
    - logs estruturados de drivers carregados/falhos preservados.
  - Observabilidade de stack expandida:
    - `chat.portal.stack.status` agora retorna `drivers.details` com source/entry/package/reason por driver.

- Validacao entrega 4:
  - `pnpm vitest run src/agents/driver-runtime.test.ts src/gateway/server-methods/chat-portal.test.ts src/gateway/server-methods/chat.abort-persistence.test.ts src/gateway/server-methods/providers.test.ts` -> OK
  - `pnpm tsgo` -> OK
