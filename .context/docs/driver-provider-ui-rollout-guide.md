---
type: doc
name: driver-provider-ui-rollout-guide
description: Guia operacional da UI para drivers/providers/modelos no frontend enterprise (Drivers, Providers, Agents, Swarm)
category: operations
generated: 2026-02-23
status: filled
scaffoldVersion: "2.0.0"
---

# Driver/Provider UI Rollout Guide

## Objetivo

Documentar como operar a trilha `driver/provider/model` no frontend após os Plans 2 e 3.

## Telas principais

### 1. `/drivers` (tela principal de operação)

Use esta tela para o fluxo guiado:

1. selecionar `driver`
2. selecionar `provider` daquele driver
3. salvar/remover credencial
4. rodar smoke de credencial
5. rodar smoke de rota
6. sincronizar catálogo local (`Sync models`)

### 2. `/providers` (compatibilidade)

Tela mantida para compatibilidade durante migração de UX.

- Continua útil para validação rápida provider-centric.
- A operação recomendada agora é driver-aware em `/drivers`.

### 3. `Agents > Overview`

Agora suporta:

- picker estruturado `Driver -> Provider -> Model route`
- campo pesquisável (datalist) para rota/modelo
- preview de metadados da rota selecionada:
  - `driver`
  - `provider`
  - `model`
  - `tool mode`
  - `toolContract` (preview quando presente)

Importante:
- `Tool Mode` é metadata da rota de modelo (API/ferramenta)
- `Tool Mode` **não** transforma o agente em container/tool separado

### 4. `Agents > Swarm`

A tela mostra:

- times e workers
- especialidades e escopos permitidos por worker
- inventário de runtime/catálogo da instância atual (drivers/providers/modelos/tool routes)

Uso recomendado:
- usar esse inventário como referência para montar perfil de instalação por worker no Docker Swarm
- configurar drivers reais por container via ENV

## Como interpretar os smoke tests

### Smoke de credencial (`drivers.credentials.test`)

Valida:
- driver carregado (quando informado)
- credencial encontrada
- existência de modelos daquele provider no runtime atual

Não executa inferência real.

### Smoke de rota (`drivers.smoke.test level=route`)

Modo atual: **transicional (catalog availability)**

Valida:
- rota existe no catálogo carregado
- driver está carregado
- credencial existe para o provider

Não executa inferência curta real nesta fase.

## Fluxo recomendado por operador (swarm)

1. Configurar drivers por container via `.env`
2. Reiniciar gateway do container
3. Abrir `/drivers`
4. Validar runtime (`enabled/loaded/failed`)
5. Cadastrar credenciais por `driver/provider`
6. Rodar smoke de credencial e rota
7. Em `Agents > Overview`, selecionar rota `driver/provider/model`
8. Em `Agents > Swarm`, cadastrar team/workers e usar inventário de referência para perfis

## FAQ rápido

### O provider aparece mas o driver não carrega

- Verifique `OPENCLAW_DRIVERS_ENABLED`
- Verifique `OPENCLAW_DRIVER_<ID>_ENABLED=1`
- Verifique `ENTRY`/`PACKAGE` do driver externo
- Veja `reason` em `/drivers`

### A credencial está OK mas não há modelos

Possíveis causas:
- driver não carregado nessa instância
- catálogo seeded sem rota para esse provider
- provider só terá modelos após discovery live (futuro)

### A rota está em tool mode, mas não vira “agente tool”

Correto. `tool mode` é rota de modelo reutilizável como ferramenta/API, não um tipo de agente/container.

## Referências

- `.context/plans/driver-provider-runtime-master-plan.md`
- `.context/plans/driver-provider-plan-2-credentials-discovery-and-smoke.md`
- `.context/plans/driver-provider-plan-3-ui-swarm-ops-and-rollout.md`
- `.context/docs/driver-onboarding-runbook.md`

