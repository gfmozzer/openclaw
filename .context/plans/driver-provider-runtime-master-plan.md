---
title: "Driver + Provider Runtime Master Plan"
status: in_progress
priority: CRITICAL
parallelizable: partial
updated: 2026-02-23
owner: "platform-architecture"
---

# Master Plan: Driver + Provider Runtime

## Objetivo

Preparar o core para arquitetura pluggable onde:

- `driver` (SDK/adaptador) e `provider` (billing/auth) sao entidades distintas.
- Um mesmo modelo pode existir em multiplos drivers.
- Cada instalacao (container de agente no swarm) carrega apenas os drivers necessarios.
- Credenciais, discovery de modelos e smoke test funcionam por rota tecnica:
  `driver + provider + model`.
- Modelos podem operar em dois papeis:
  - `agent mode` (modelo de raciocinio/conversa)
  - `tool mode` (modelo exposto como ferramenta/API para outros agentes).
- Papeis de swarm (`manager/supervisor/worker`) permanecem papeis de agentes em containers isolados,
  e nunca representam "agente tool".

## Diagnostico atual (evidencia no codigo)

1. Driver e provider estao acoplados no dominio atual.
- `src/config/types.models.ts` usa `models.providers` como entidade unica.
- Campo `api` define o protocolo de chamada, mas nao existe entidade de driver separada.

2. RPC de providers nao representa camada de driver.
- `src/gateway/protocol/schema/providers.ts` opera com `providerId` apenas.
- `src/gateway/providers-service.ts` calcula registro/modelos por provider.

3. Auth e env tambem assumem provider como chave primaria.
- `src/agents/model-auth.ts` resolve credenciais por `provider`.
- Sem registro formal de `driverId` e sem policy de carregamento por instalacao.

## Arquitetura alvo

### Entidades

- `Driver`: adaptador de integracao (native, litellm, fal, etc).
- `Provider`: origem de credencial e cobranca (OpenAI, Anthropic, DeepSeek, etc).
- `Route`: combinacao executavel (`driverId`, `providerId`, `modelId`).

### Regras de selecao

- Configuracao de agente passa a escolher `driver` + `provider` + `model`.
- Mesmo `provider/model` pode aparecer em mais de um driver.
- Fallback pode trocar de modelo dentro do mesmo driver ou trocar de driver.

### Regras de smoke test

1. `driver` load test (SDK carregou e health basico respondeu).
2. `credential` test (provider auth ok no contexto do driver).
3. `route` test (inferência curta em `driver/provider/model`).
4. `capability` test opcional (chat, image, video, audio, tools).

## Contrato de ambiente (container-aware)

Padrao por instalacao/container:

- `OPENCLAW_DRIVERS_ENABLED=native,litellm`  
  Lista de drivers permitidos nesta instancia.
- `OPENCLAW_DRIVER_DEFAULT=native`  
  Driver default para resolucao de modelos legados.
- `OPENCLAW_DRIVER_<ID>_ENABLED=1`  
  Toggle fino por driver.
- `OPENCLAW_DRIVER_<ID>_ENTRY=...` (opcional)  
  Entry point para driver externo.
- `OPENCLAW_DRIVER_<ID>_PACKAGE=...` (opcional)  
  Pacote NPM do driver quando extensivel.

Observacao: para swarm, cada worker/supervisor define seu proprio conjunto de drivers no env.

## Planos filhos

1. `driver-provider-plan-0-domain-and-compat.md`
2. `driver-provider-plan-1-runtime-loader-and-env-gating.md`
3. `driver-provider-plan-2-credentials-discovery-and-smoke.md`
4. `driver-provider-plan-3-ui-swarm-ops-and-rollout.md`

## Ordem e paralelizacao

- Sequencia recomendada:
1. Plan 0 (dominio + compat)
2. Plan 1 (loader + env)
3. Plan 2 (credenciais/discovery/smoke)
4. Plan 3 (UI/ops/rollout)

- Paralelo seguro:
1. Plan 3 (wireframes/UX + docs) em paralelo ao final do Plan 1.
2. Parte de testes do Plan 2 em paralelo ao final do Plan 1.

## Criterio de pronto do programa

- Operador escolhe `driver/provider/model` sem editar JSON manual.
- Instancia de agente carrega apenas drivers permitidos no env.
- Smoke test cobre driver, credencial e rota.
- Fluxo legado (`provider/model`) continua funcional durante migracao.
- Telemetria e auditoria diferenciam claramente driver vs provider.
- Operador consegue marcar uma rota como `tool mode` e reutilizá-la como tool em outros agentes.

## Status consolidado (2026-02-23)

- `Plan 0`:
  - Base de domínio/compat `driver::provider/model` implementada no core (arquivo ainda está com status desatualizado).
- `Plan 1`:
  - Concluído (env gating, preload, fail-fast, observabilidade em `chat.portal.stack.status`).
- `Plan 2`:
  - Concluído (backend/control-plane):
    - metadata `toolMode/toolContract` propagada no catálogo/providers RPC
    - contratos/handlers dedicados `drivers.registry.list`, `drivers.providers.list`, `drivers.models.list`, `drivers.credentials.*`, `drivers.smoke.test`
    - smoke matrix (`driver`, `credential`, `route`) em modo transicional para `route`
    - rate limit + audit trail para mutate/test de `drivers.credentials.*`
    - compatibilidade `providers.*` preservada durante migração
  - follow-ups (próximos planos):
    - smoke de rota com inferência curta real
    - discovery live por driver (quando suportado)
    - adapters de execução por capability (ex.: Fal tool runtime)
- `Plan 3`:
  - Concluído (frontend/ops rollout):
    - rota `/drivers` com diagnóstico + fluxo guiado inicial (`driver -> provider -> credencial -> smoke -> sync`)
    - `Agents > Overview` com picker `driver/provider/model route` e preview `toolMode/toolContract`
    - `Agents > Swarm` com inventário de runtime/catálogo para perfil de workers
    - docs/runbook de UI e rollout
  - follow-ups:
    - unificação visual completa `/providers` + `/drivers`
    - e2e com perfil de runtime por container real no swarm
