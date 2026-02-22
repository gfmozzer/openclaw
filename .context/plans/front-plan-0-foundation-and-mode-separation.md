---
title: "Plan 0: Foundation + Mode Separation (Client vs Admin)"
status: completed
priority: CRITICAL
parallelizable: no
updated: 2026-02-22
owner: "frontend-core"
---

# Plan 0: Foundation and Information Architecture

## Objetivo

Criar a fundacao para separar portal cliente e console admin sem quebrar rotas existentes.

## Problemas atuais

- Navegacao unica para perfis diferentes (cliente e operador).
- Rotas sensiveis visiveis no mesmo shell (`/config`, `/debug`, `/logs`).
- Sem semaforo claro de modo de orquestracao (temporal/local) e backend stateless.

## Entregas

1. Modelo de modo de UI
- Adicionar `uiMode` em estado global: `client | admin`.
- Persistir em settings locais com fallback seguro para `admin` (transicao).

2. Gate de navegacao por modo
- `client`: mostrar apenas `chat`, `overview` simplificado, `channels` restrito, `usage` opcional.
- `admin`: mostrar todas as rotas.
- Esconder no modo cliente: `config`, `debug`, `logs`, `nodes`, `sessions` tecnico.

3. Header de estado enterprise
- Mostrar badges: `orchestrationMode`, `statelessBackend`, `stack health`.
- Fonte inicial: `chat.portal.stack.status` + info local de conexao.

4. Renomeacao sem quebra
- Tab `cron` passa a rotulo "Jobs" quando temporal estiver ativo.
- Mantem rota legada por compatibilidade.

## Arquivos alvo (estimado)

- `ui/src/ui/navigation.ts`
- `ui/src/ui/app-view-state.ts`
- `ui/src/ui/app-render.ts`
- `ui/src/ui/i18n/*` (novas chaves)
- `ui/src/styles/base.css` (badges e estados)

## Testes

- Snapshot/render por modo (`client` vs `admin`).
- Navegacao: abas ocultas nao renderizam no modo cliente.
- Persistencia de `uiMode` em reload.

## Criterio de aceite

- Usuario cliente nao acessa UI de operacao sensivel via menu.
- Operador ve estado enterprise global no topo.
- Nenhuma rota existente quebrada.

## Resultado da execucao

- `uiMode` (`client | admin`) implementado e persistido em `UiSettings`.
- Navegacao filtrada por modo com bloqueio de aba em `setTab`/`setTabFromRoute`.
- Header enterprise implementado com badges de:
  - `orchestrationMode` (via `cron.status`)
  - `statelessBackend` e probes Redis/S3/Postgres (via `chat.portal.stack.status`)
- Renomeacao de `cron` para `Jobs` ativada quando `orchestrationMode` contem `temporal`.
- Chaves i18n adicionadas (`tabs.jobs`, `subtitles.jobs`) em EN/PT-BR.

## Fora de escopo

- Render rico de dashboard/chat (Plan 1).
- CRUD completo de jobs/swarm (Plan 2).
