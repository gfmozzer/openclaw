---
title: "Plan 1: Frontend Credentials Console + Provider/Model Picker by Agent"
status: completed
priority: CRITICAL
parallelizable: yes
updated: 2026-02-23
owner: "frontend-enterprise"
---

# Plan 1: Frontend Credentials and Model Picker

## Objetivo

Substituir o fluxo de configuracao manual via JSON por UX guiada para:
- cadastrar/testar credenciais por provider
- escolher provider/model por agente em dropdown pesquisavel
- enxergar status de disponibilidade e falhas de credencial

## Progresso atual

- [x] Nova aba `providers` adicionada na navegacao e i18n (pt-BR/en).
- [x] Controller `providers.ts` criado com fallback para backend indisponivel.
- [x] View `providers.ts` criada com lista, cadastro, teste e remocao de credenciais.
- [x] Integracao da aba Providers no `app-render` + `app-settings`.
- [x] Picker de modelo em `Agents > Overview` agora prioriza `providers.models.list`.
- [x] UX final de combobox pesquisavel no painel Agents (`input + datalist`).
- [x] Testes unit/UI especificos do Plan 1 (`providers.test.ts`).

## Escopo tecnico

1. Console de credenciais (nova area admin)
- Lista de providers suportados com status:
  - configured/not configured
  - test ok/fail
  - origem dos modelos (builtin/discovered/custom)
- Acoes por provider:
  - inserir/atualizar credencial
  - testar credencial
  - remover credencial

2. Picker de provider/model no painel de agentes
- `ui/src/ui/views/agents.ts` deixa de depender apenas de `agents.defaults.models`.
- Fonte principal de opcoes: `providers.models.list`.
- Combobox pesquisavel (provider + model) com fallbacks por multi-select simples.
- Preservar opcao de herdar modelo default quando agente nao tiver override.

3. UX de erro e observabilidade
- Mensagem clara quando provider nao suporta listagem live.
- Mensagem clara quando falta credencial.
- Mostrar ultima validacao de credencial e ultima sincronizacao de modelos.

4. Compatibilidade com config raw
- Nao remover `/config` raw.
- Toda alteracao feita na nova UI deve refletir no config/estado real sem JSON manual.

## Arquivos alvo (estimado)

- `ui/src/ui/navigation.ts` (nova aba admin opcional)
- `ui/src/ui/app-view-state.ts`
- `ui/src/ui/app-settings.ts`
- `ui/src/ui/app-render.ts`
- `ui/src/ui/controllers/providers.ts` (novo)
- `ui/src/ui/views/providers.ts` (novo)
- `ui/src/ui/views/agents.ts`
- `ui/src/ui/views/agents-utils.ts`
- `ui/src/ui/i18n/*`

## Regras de UX

- Nunca pedir que usuario digite slug manual em fluxo principal.
- Campo manual avancado fica opcional e isolado.
- Botao salvar deve validar antes (test opcional rapido).
- Evitar estados silenciosos: sempre mostrar feedback de sucesso/erro.

## Testes

1. Unit
- mapeamento de respostas RPC -> estado de tela
- selecao provider/model -> patch correto de configuracao do agente

2. UI
- render da lista de providers
- fluxo inserir/testar/remover credencial
- fluxo alterar modelo do agente e persistir

3. Regressao
- painel Agents continua funcional para tools/skills/swarm
- tab Debug continua mostrando `models.list`

## Criterio de aceite

- Operador configura credencial sem abrir JSON raw.
- Operador escolhe provider/model por agente por dropdown.
- Falhas de credencial/modelo sao explicitas e acionaveis.

## Complexidade detalhada

- Dominio tecnico: medio-alto
- Risco de regressao: medio
- Esforco estimado: 3 a 5 dias uteis
