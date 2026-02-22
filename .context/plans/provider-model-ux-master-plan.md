---
title: "Provider + Model UX Master Plan"
status: completed
priority: CRITICAL
parallelizable: partial
updated: 2026-02-22
owner: "platform-architecture"
---

# Master Plan: Provider + Model UX

## Objetivo

Remover o fluxo manual em JSON para escolha de provider/model e criar um fluxo enterprise seguro:
- tela de credenciais por provider
- validacao/smoke test de credencial
- descoberta de modelos por provider
- seletor por agente com provider/model sem adivinhar slug

## Diagnostico atual (evidencia no codigo)

1. Dropdown de modelo no painel de agentes nao usa o catalogo real do backend.
- `ui/src/ui/views/agents-utils.ts`: `buildModelOptions()` le somente `agents.defaults.models`.
- `ui/src/ui/views/agents.ts`: select usa `buildModelOptions(...)`.

2. O backend ja tem catalogo de modelos, mas esta isolado no metodo de debug.
- `src/gateway/server-methods/models.ts`: `models.list` chama `loadGatewayModelCatalog()`.
- UI usa isso apenas em debug (`ui/src/ui/controllers/debug.ts`).

3. O editor `/config` nao e um fluxo seguro para operacao de modelo/credencial.
- `src/gateway/server-methods/config.ts`: `config.set` e substituicao total do config.
- `src/config/zod-schema.core.ts`: `models.providers.*` exige `baseUrl` + `models[]`; `{}` quebra validacao.

4. A base tecnica para credenciais e descoberta ja existe, mas sem UX web.
- Credenciais: `src/agents/auth-profiles.ts`.
- Descoberta/injecao implicita: `src/agents/models-config.providers.ts`.
- Status de auth: `src/agents/auth-health.ts`.

## Nivel de complexidade

Complexidade geral: ALTA (8/10).

- Backend (novos contratos RPC + seguranca + auditoria): alta.
- Frontend (nova console de credenciais + picker por agente): alta.
- Compatibilidade/migracao (config legado + env): media.
- Testes (unit + gateway + UI): alta.

Estimativa de esforco (1 engenheiro): 8 a 12 dias uteis.
Estimativa com 2 agentes (back + front em paralelo): 5 a 8 dias uteis.

## Planos filhos

1. `provider-model-plan-0-backend-contract-and-security.md`
2. `provider-model-plan-1-frontend-credentials-and-model-picker.md`
3. `provider-model-plan-2-migration-hardening-and-rollout.md`

## Ordem e paralelizacao

- Sequencial obrigatorio:
1. Plan 0 (contratos backend minimos)
2. Integracao frontend principal do Plan 1
3. Plan 2 (migracao/hardening/finalizacao)

- Pode rodar em paralelo com baixo risco:
1. Plan 1 (layout/UX local com mocks) paralelo ao fim do Plan 0.
2. Documentacao parcial do Plan 2 paralelo ao fim do Plan 1.

## Criterio de pronto do programa

- Usuario nao precisa editar JSON para credencial/provider/model.
- Provider com credencial valida aparece como disponivel.
- Modelos disponiveis sao exibidos por provider (catalogo real, nao hardcoded local).
- Agente escolhe provider/model por dropdown pesquisavel.
- Overrides por request continuam funcionando e auditados.
- Fluxo legado (config raw) continua possivel, mas nao necessario para operacao comum.

## Status final (2026-02-22)

- Planos filhos:
  - `provider-model-plan-0-backend-contract-and-security.md` -> concluido
  - `provider-model-plan-1-frontend-credentials-and-model-picker.md` -> concluido
  - `provider-model-plan-2-migration-hardening-and-rollout.md` -> concluido

- Validacao executada:
  - `pnpm tsgo` -> OK
  - `pnpm --dir ui build` -> OK
  - `pnpm --dir ui test src/ui/controllers/providers.test.ts` -> OK (5/5)
  - `pnpm vitest run src/gateway/server-methods/providers.test.ts` -> OK (34/34)

- Risco residual conhecido:
  - nao existe teste dedicado de view em `ui/src/ui/views/providers.test.ts`; cobertura atual fica concentrada em controller/integracao.
