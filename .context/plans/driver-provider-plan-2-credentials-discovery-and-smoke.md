---
title: "Driver/Provider Plan 2: Credentials, Discovery, and Smoke Matrix"
status: completed
priority: HIGH
parallelizable: partial
updated: 2026-02-23
owner: "platform-security"
---

# Plan 2: Credentials, Discovery, and Smoke Matrix

## Objetivo

Formalizar credenciais e descoberta de modelos por `driver/provider`.

## Escopo tecnico

1. Evolucao de contratos RPC
- Adicionar contratos com `driverId` explicito:
  - `drivers.registry.list`
  - `drivers.providers.list`
  - `drivers.models.list`
  - `drivers.credentials.*`
  - `drivers.smoke.test`
- Manter `providers.*` como alias de compatibilidade na transicao.

2. Credenciais por escopo correto
- Suportar credencial:
  - no provider (padrao)
  - no driver (caso especial, ex: fal)
- Persistir metadados sem segredo em respostas.

3. Discovery por driver
- Cada driver implementa estratégia de discovery:
  - live API quando suportado
  - fallback de catalogo estatico
- Cache curto com invalidação apos alteracao de credencial.

4. Smoke test em 3 niveis
- `driver`: health/load.
- `credential`: auth minima.
- `route`: inferencia curta.

5. Seguranca e compliance
- Escopos RBAC dedicados.
- Rate limit para `*.test`.
- Audit log para mutate/test.

6. Contrato de `Tool Mode` por rota de modelo
- Adicionar metadata opcional por rota:
  - `toolMode: boolean`
  - `toolContract` (shape/inputs/outputs) para modelos usados como API/ferramenta.
- Regra:
  - rota com `toolMode=true` pode ser exposta como ferramenta reutilizavel por outros agentes;
  - rota com `toolMode=false` segue fluxo normal de agente/modelo conversacional.
- Compatibilidade:
  - default permanece `toolMode=false` para nao quebrar configuracoes existentes.

## Arquivos alvo (estimado)

- `src/gateway/protocol/schema/*.ts`
- `src/gateway/server-methods/*.ts`
- `src/gateway/providers-service.ts` (ou substituto por driver-service)
- `src/agents/model-auth.ts`
- testes de gateway + unit

## Testes

1. Unit
- regras de resolucao credencial por driver/provider.
- invalidação de cache em update/delete.

2. Integration
- provider com mesmo modelo em dois drivers.
- smoke test passa em um driver e falha em outro com erro explicito.

3. Security
- snapshot sem segredos.
- negative tests de escopo e rate limit.

## Criterio de aceite

- Operador diferencia claramente erro de driver vs provider.
- Discovery e smoke funcionam por rota tecnica.
- Auditoria e metricas completas.
- Rotas marcadas como `toolMode` ficam prontas para consumo por agentes como ferramenta (via contrato explícito).

## Progresso (2026-02-23)

- Fundacao de `Tool Mode` implementada:
  - Regra de arquitetura aplicada:
    - `Tool Mode` é metadata de rota de modelo/API (não é tipo de agente/container).
    - papéis de swarm (`manager/supervisor/worker`) nunca são convertidos em "agente tool".
  - Config (fonte canônica):
    - `models.providers.<provider>.models[].toolMode`
    - `models.providers.<provider>.models[].toolContract`
    - arquivos: `src/config/types.models.ts`, `src/config/zod-schema.core.ts`
  - Catalogo:
    - `loadModelCatalog` passa a propagar `toolMode/toolContract` por rota.
    - arquivo: `src/agents/model-catalog.ts`
  - RPC/Providers:
    - `providers.models.list` passa a expor `driverId`, `modelRoute`, `toolMode`, `toolContract`.
    - arquivos: `src/gateway/providers-service.ts`, `src/gateway/protocol/schema/providers.ts`

- Validacao:
  - `pnpm vitest run src/agents/model-catalog.test.ts src/gateway/server-methods/providers.test.ts` -> OK (41/41)
  - `pnpm tsgo` -> OK

- Entrega adicional (drivers.* dedicado) implementada:
  - `drivers.providers.list` implementado com matriz `driver -> providers` (contagem de modelos por driver/provider).
  - `drivers.registry.list` implementado como contrato/handler dedicado (não-alias), com contagem por driver:
    - `providerCount`
    - `modelCount`
    - status runtime (`enabled/loaded/source/reason`)
  - `drivers.models.list` implementado como contrato/handler dedicado (não-alias), retornando árvore:
    - `driver -> provider -> models`
  - `drivers.credentials.*` implementado como contrato/handler dedicado (não-alias), com suporte explícito a:
    - `driverId` + `providerId`
    - fallback driver-level (`providerId = driverId`) para casos especiais (ex.: `fal`)
    - audit trail para `upsert/delete/test`
    - rate limit para `drivers.credentials.test`
  - `drivers.smoke.test` implementado com níveis:
    - `driver` (enabled/loaded)
    - `credential` (profile/provider + modelos disponíveis)
    - `route` (disponibilidade da rota no catálogo + driver carregado + credencial)
  - Contratos TypeBox/AJV adicionados para:
    - `DriversRegistryList*`
    - `DriversProvidersList*`
    - `DriversModelsList*`
    - `DriversCredentials*`
    - `DriversSmokeTest*`
  - `drivers.*` mantido híbrido apenas no nível de coexistência com `providers.*`:
    - `providers.*` continua como superfície legada/compatível
    - `drivers.*` já possui handlers dedicados para registry/providers/models/credentials/smoke
  - Escopos e method list atualizados:
    - `drivers.providers.list` em `READ_SCOPE`
    - anúncio em `listGatewayMethods()`

- Validacao adicional (drivers.*):
  - `pnpm vitest run src/gateway/server-methods/drivers.test.ts src/gateway/server-methods/providers.test.ts` -> OK (42/42)
  - `pnpm tsgo` -> OK

- Validacao adicional (registry/models dedicados):
  - `pnpm vitest run src/gateway/server-methods/drivers.test.ts` -> OK (7/7)
  - `pnpm tsgo` -> OK

- Validacao adicional (credentials dedicados):
  - `pnpm vitest run src/gateway/server-methods/drivers.test.ts` -> OK (10/10)
  - `pnpm vitest run src/gateway/server-methods/drivers.test.ts src/gateway/server-methods/providers.test.ts` -> OK (47/47)
  - `pnpm vitest run src/agents/model-catalog.test.ts src/agents/driver-runtime.test.ts src/agents/model-auth.env-drivers.test.ts` -> OK (13/13)
  - `pnpm tsgo` -> OK

## Encerramento do Plan 2

O objetivo do Plan 2 foi concluído no backend/control-plane:

- contratos `drivers.*` dedicados disponíveis
- credenciais por `driver/provider` suportadas (incluindo fallback driver-level)
- discovery e listagens por driver expostas
- smoke matrix (`driver`, `credential`, `route`) operacional
- RBAC/rate limit/audit implementados para mutate/test
- metadata de `toolMode/toolContract` propagada por rota

## Itens deliberadamente deixados para planos seguintes (não bloqueiam o Plan 2)

1. Discovery live por driver (com cache e invalidação por credencial) para providers que suportam API de catálogo.
2. `drivers.smoke.test level=route` com inferência curta real por capability/driver (hoje é smoke transicional de disponibilidade de rota + credencial).
3. UI operacional completa (`/drivers`) com wizard driver -> provider -> credencial -> smoke -> sync (`Plan 3`).
4. Adapters de execução de mídia/tool específicos (ex.: Fal) para consumo real em `Tool Mode`.
