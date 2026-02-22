---
type: doc
name: driver-onboarding-runbook
description: Como adicionar novos drivers (SDKs) e providers ao runtime por container, com env gating, credenciais e smoke tests
category: architecture
generated: 2026-02-22
status: filled
scaffoldVersion: "2.0.0"
---

# Driver Onboarding Runbook

## Objetivo

Documentar como novas integracoes (SDKs/drivers) entram no sistema sem hardcode global, respeitando:

- isolamento por container no Docker Swarm
- carregamento por ENV (`driver runtime gating`)
- separacao entre `driver` e `provider`
- rastreabilidade de credenciais, discovery e smoke test

Este documento complementa:
- `driver-provider-runtime-master-plan.md`
- `driver-provider-plan-1-runtime-loader-and-env-gating.md`
- `driver-provider-plan-2-credentials-discovery-and-smoke.md`

## Conceitos (na pratica)

### Driver

SDK/adaptador de integracao.

Exemplos:
- `native`
- `litellm`
- `fal` (futuro)
- `azure` (opcional futuro)

### Provider

Origem de credencial e cobranca.

Exemplos:
- `openai`
- `anthropic`
- `deepseek`
- `azure-openai`
- `fal` (caso especial)

### Model Route

Rota executavel com contexto tecnico completo:

- `driverId`
- `providerId`
- `modelId`

Formato canônico no dominio novo:
- `driver::provider/model`

Exemplo:
- `litellm::openai/gpt-4o-mini`

## Estado atual do alicerce (ja implementado)

### 1. Driver runtime gating por ENV

Ja existe no core:

- `OPENCLAW_DRIVERS_ENABLED`
- `OPENCLAW_DRIVER_DEFAULT`
- `OPENCLAW_DRIVER_<ID>_ENABLED`
- `OPENCLAW_DRIVER_<ID>_ENTRY`
- `OPENCLAW_DRIVER_<ID>_PACKAGE`

Comportamento atual:

1. Drivers built-in (`native`, `litellm`) carregam quando habilitados.
2. Drivers externos so sao considerados quando `OPENCLAW_DRIVER_<ID>_ENABLED=1/true`.
3. Driver externo usa import dinamico por `ENTRY` ou `PACKAGE`.
4. Falha de import nao derruba gateway; aparece em `chat.portal.stack.status`.

### 2. Fail-fast quando rota exige driver ausente

`chat.send` falha com `INVALID_REQUEST` se a rota resolver para um driver nao carregado na instancia.

Isso e essencial para swarm:
- cada container expõe apenas o que foi instalado/habilitado.

### 3. Observabilidade no portal

`chat.portal.stack.status` retorna:

- `drivers.defaultDriver`
- `drivers.enabled`
- `drivers.loaded`
- `drivers.failed`
- `drivers.details` (source/entry/package/reason)

## Processo padrao para adicionar um novo driver (futuro)

## Fase A - Planejamento (obrigatoria)

Antes de instalar SDK:

1. Definir papeis
   - `driverId`
   - providers que ele atende
   - capacidades (`chat`, `image`, `video`, `audio`, `tools`)
2. Definir modelo de credencial
   - provider-level (`api_key`, `token`, `oauth`)
   - driver-level (casos especiais)
3. Definir estrategia de discovery
   - API live
   - catalogo estatico
   - hibrido
4. Definir smoke tests
   - driver / credential / route

## Fase B - Instalacao por container

Instale somente no container que precisa do driver.

Exemplo:

```bash
pnpm add @acme/openclaw-driver-fal
```

Ou, se o driver for implementado localmente:
- manter entry local e usar `OPENCLAW_DRIVER_<ID>_ENTRY`

## Fase C - Habilitacao por ENV (gating)

Exemplo base:

```env
OPENCLAW_DRIVERS_ENABLED=native,litellm,fal
OPENCLAW_DRIVER_DEFAULT=native

OPENCLAW_DRIVER_NATIVE_ENABLED=1
OPENCLAW_DRIVER_LITELLM_ENABLED=1
OPENCLAW_DRIVER_FAL_ENABLED=1
OPENCLAW_DRIVER_FAL_PACKAGE=@acme/openclaw-driver-fal
```

Regras:

1. Nao basta listar em `OPENCLAW_DRIVERS_ENABLED`; driver externo tambem precisa de `_ENABLED=1`.
2. Definir apenas os drivers necessarios naquele container.
3. Reiniciar gateway apos alterar ENV.

## Fase D - Credenciais

Prioridade canonica (operacao):

1. **Providers UI / Auth Profiles** (preferido)
2. ENV (fallback operacional)
3. Config inline legado (evitar para operacao diaria)

Observacao:
- `drivers.registry.list`, `drivers.providers.list`, `drivers.models.list`, `drivers.credentials.*` e `drivers.smoke.test` já existem como RPCs dedicados.
- `drivers.smoke.test` em `level=route` ainda é transicional (smoke de disponibilidade de rota + credencial), não inferência real.
- A UI principal de credenciais/smoke ainda está concentrada em `/providers`, enquanto `/drivers` cobre diagnóstico de runtime.

## Fase E - Validacao operacional

### Checklist minimo

1. `chat.portal.stack.status`
   - driver aparece em `enabled`
   - driver aparece em `loaded`
   - `failed` vazio (ou motivo claro)
2. `providers.registry.list` / `providers.models.list`
   - modelos filtrados respeitam drivers carregados
3. `chat.send`
   - rota suportada executa
   - rota com driver ausente falha corretamente

## Exemplo de rollout por tipo de agente (swarm)

### Supervisor (texto/orquestracao)

```env
OPENCLAW_DRIVERS_ENABLED=native,litellm
OPENCLAW_DRIVER_NATIVE_ENABLED=1
OPENCLAW_DRIVER_LITELLM_ENABLED=1
```

### Worker de imagem/video (Fal)

```env
OPENCLAW_DRIVERS_ENABLED=native,fal
OPENCLAW_DRIVER_NATIVE_ENABLED=1
OPENCLAW_DRIVER_FAL_ENABLED=1
OPENCLAW_DRIVER_FAL_PACKAGE=@acme/openclaw-driver-fal
```

### Worker Azure enterprise

```env
OPENCLAW_DRIVERS_ENABLED=native,azure
OPENCLAW_DRIVER_NATIVE_ENABLED=1
OPENCLAW_DRIVER_AZURE_ENABLED=1
OPENCLAW_DRIVER_AZURE_PACKAGE=@acme/openclaw-driver-azure
```

## Tool Mode e drivers (regra de arquitetura)

`Tool Mode` nao cria "agente tool" e nao cria container.

`Tool Mode` significa:
- uma **rota de modelo** exposta como ferramenta/API reutilizavel.

Consequencias:

- `manager/supervisor/worker` continuam papeis de agentes (containers isolados).
- Um modelo Fal ou Azure pode ser `toolMode=true` e ser usado por um supervisor sem virar subagente/container.

## Gaps restantes (para fechar nos proximos planos)

1. Discovery live por driver (com cache/invalidação)
2. Smoke test de `route` com inferência curta real (hoje catálogo/availability)
3. UI completa driver/provider/model (com perfil de swarm)
4. Adapters de execução por capability/tool (ex.: Fal em Tool Mode end-to-end)

## Referencias internas

- `.context/providers/azure-ai.md`
- `.context/providers/fal-ai.md`
- `.context/plans/driver-provider-runtime-master-plan.md`
- `.context/plans/driver-provider-plan-1-runtime-loader-and-env-gating.md`
- `.context/plans/driver-provider-plan-2-credentials-discovery-and-smoke.md`
- `.context/plans/driver-provider-plan-3-ui-swarm-ops-and-rollout.md`
