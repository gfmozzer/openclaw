---
status: filled
generated: 2026-02-21
title: "Enterprise Ops and Chat-First Frontend Contract"
owner: "documentation-writer"
---

# Enterprise Ops and Chat-First Frontend Contract

> Plano para fechar C1-08, C1-09 e C2-10 com foco em operacao, UX administrativa e handoff para frontend.

## Objetivo
Entregar contrato operacional completo (env + docs + FAQ + API local + UX base) para operar swarm enterprise via chat-first.

## Entregas obrigatorias
1. `.env.example` com bloco enterprise completo e comentado em PT-BR/EN.
2. Matriz de variaveis por ambiente (`dev`, `staging`, `prod`) em `tooling.md`.
3. Pagina local de docs/FAQ no frontend consumindo contrato vivo do backend.
4. Guia operacional de canais (WhatsApp/Telegram/Slack) com autenticacao e limites.
5. Tema verde/preto aplicado nas telas administrativas principais.
6. Strings-base i18n PT/EN para fluxos de operacao swarm.

## Fases

### Fase 1 - Contract e docs operacionais
1. Mapear todos os endpoints enterprise (swarm, cron, chat.portal, byok, metrics).
2. Publicar tabela endpoint -> role/scope -> exemplos request/response.
3. Criar FAQ local no frontend para:
   - como escolher modelo/token
   - como criar subagente
   - como atrelar worker em swarm
   - como conectar canais e autenticar
4. Atualizar `development-workflow.md` e `tooling.md` com runbook de stack local.

### Fase 2 - Env parity e bootstrap
1. Atualizar `.env.example` com:
   - S3/MinIO (`OPENCLAW_S3_*`)
   - Redis (`OPENCLAW_REDIS_*`)
   - Temporal (`OPENCLAW_TEMPORAL_*` + callback secret)
   - BYOK/override (`OPENCLAW_BYOK_*`)
   - Portal/Frontend flags
2. Adicionar comentarios claros em portugues para cada variavel.
3. Incluir exemplos de compose local reaproveitando Redis/MinIO existentes.

### Fase 3 - Chat-first Admin UI contract
1. Implementar consumo de `chat.portal.contract` e `chat.portal.stack.status`.
2. Exibir status da stack (redis, minio, temporal, postgres, channels).
3. Criar visualizacao de docs endpoints dentro da UI.
4. Garantir que fluxo administrativo seja possivel sem sair do chat principal.

### Fase 4 - Branding e i18n
1. Centralizar tokens de cor e trocar acentos para verde/preto.
2. Revisar contraste/acessibilidade.
3. Criar base i18n PT-BR/EN para menus de swarm e tools.
4. Garantir que novo texto tecnico esteja traduzivel sem hardcode.

## Definition of Done
1. Nova instalacao sobe com `.env.example` sem adivinhacao.
2. Operador entende setup de worker/supervisor apenas lendo FAQ local.
3. UI mostra contrato backend vivo e status da stack.
4. Tema verde/preto aplicado sem regressao visual critica.
5. PT/EN alterna textos essenciais de operacao.

## Evidencias
1. Capturas das telas de docs/FAQ e stack status.
2. Diff de `.env.example` + docs atualizadas.
3. Testes de frontend (render + i18n + contract fetch).
4. Checklist de usabilidade respondendo as perguntas operacionais do time.

## Dependencias
1. Backend workflows 18-20 (para endpoints finais).
2. Definicao de segurança callback e principal (para docs corretas).
3. Disponibilidade de agente frontend separado para implementacao visual extensa.
