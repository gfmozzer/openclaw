---
title: "Plan 1: Chat Portal + Rich Renderers"
status: completed
priority: CRITICAL
parallelizable: yes (apos Plan 0)
updated: 2026-02-22
owner: "frontend-chat"
---

# Plan 1: Client Portal (Chat-First)

## Objetivo

Transformar `/chat` no portal principal do cliente com renderizacao rica e governanca por permissao.

## Problemas atuais

- Chat ainda nao consome o contrato `chat.portal.contract`.
- Sem renderer formal para blocos (`table`, `chart`, `dashboard`, `actions`).
- Ausencia de controle de permissao por bloco renderizado.

## Entregas

1. Boot de contrato do portal
- Consumir `chat.portal.contract` no startup da aba chat.
- Validar `specVersion` e capacidades suportadas.
- Fallback seguro para texto quando contrato nao estiver disponivel.

2. Camada de render de blocos
- Criar parser de envelope para tipos suportados.
- Render inicial:
  - `text`
  - `table`
  - `chart` (basico)
  - `dashboard` (cards/sections)
  - `actions` (botao com payload)

3. Seguranca de render
- Enforcar politica de renderer do contrato (`allowedRenderers`).
- Para HTML: somente sandbox policy definida no contrato.
- Bloquear script inline e payload nao permitido.

4. UX de conversa enterprise
- Estados claros: "processando", "job agendado", "aguardando callback".
- Mensagens de resultado async com identificador de correlacao.

## Arquivos alvo (estimado)

- `ui/src/ui/views/chat.ts`
- `ui/src/ui/chat/*` (novo modulo para rich blocks)
- `ui/src/ui/controllers/chat.ts`
- `ui/src/ui/types/chat-types.ts`
- `ui/src/styles/base.css`

## Testes

- Parser/renderer unitario por tipo de bloco.
- Seguranca: payload invalido nao renderiza componente ativo.
- Regressao: chat texto continua funcionando.

## Criterio de aceite

- Chat renderiza blocos do contrato sem quebrar mensagens texto.
- Fallback seguro para tipos desconhecidos.
- Sem execucao de HTML inseguro.

## Dependencias backend

- `chat.portal.contract`
- `chat.portal.stack.status` (somente status)
- Eventos de callback/resume ja existentes em chat

## Progresso atual

- Boot do contrato implementado:
  - `ui/src/ui/controllers/portal-contract.ts`
  - carregamento em connect + aba chat (`app-gateway.ts`, `app-settings.ts`)
- Rich renderer implementado com parser e fallback:
  - `ui/src/ui/chat/rich-blocks.ts`
  - suportes: `text`, `table`, `chart`, `dashboard`, `actions`, `html`
- Seguranca de render aplicada:
  - gate por `allowedRenderers`
  - gate por `permissionsHint.requiredScopes`
  - `html` somente em `iframe sandbox` e bloqueio por policy insegura
- Integracao no chat:
  - `ui/src/ui/chat/grouped-render.ts`
  - `ui/src/ui/views/chat.ts`
  - callback de actions para envio estruturado em `app-render.ts`
- Estilos dedicados:
  - `ui/src/styles/chat/rich-blocks.css`
  - import em `ui/src/styles/chat.css`
- UX async refinada:
  - estados visuais `Processando`, `Job agendado`, `Aguardando callback`, `Resultado pronto`
  - exibicao de `correlationId/workflowId/runId/jobId` detectado no historico recente
- Validacao de contrato:
  - `specVersion` validada contra baseline `2026-02-21` com fallback seguro
