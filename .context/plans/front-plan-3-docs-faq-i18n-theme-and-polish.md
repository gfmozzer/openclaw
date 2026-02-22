---
title: "Plan 3: Docs/FAQ In-App + i18n + Theme Enterprise"
status: completed
priority: HIGH
parallelizable: yes (apos Plan 0)
updated: 2026-02-22
owner: "frontend-experience"
---

# Plan 3: Operator Enablement and Visual Identity

## Objetivo

Fechar lacunas de entendimento operacional com documentacao in-app, i18n e tema enterprise.

## Problemas atuais

- Operacao depende de conhecimento implicito do codigo.
- FAQ/Docs in-app inexistentes para fluxo real de canais, workers e swarm.
- UI ainda com inconsistencias visuais e linguagem mista.

## Entregas

1. Pagina Docs in-app
- [x] Nova rota `/docs` no frontend.
- Catalogo de metodos usados no dia a dia (admin):
  - [x] canais
  - [x] jobs
  - [x] swarm
  - [x] skills
  - [x] stack status
- [x] Exemplos de request/response para operacao.

2. Pagina FAQ in-app
- [x] Nova rota `/faq` com respostas operacionais:
  - [x] como conectar WhatsApp
  - [x] como conectar Telegram
  - [x] como cadastrar worker
  - [x] como associar worker a um swarm
  - [x] como validar stack (Temporal/Redis/S3/Postgres)
  - [x] como interpretar erros de auth/ws

3. i18n PT-BR/EN
- [x] Revisar strings das rotas principais e telas de operacao.
- [x] Strings adicionadas para rotas novas (`docs`, `faq`) em PT-BR/EN.
- [x] Garantir fallback consistente quando chave nao existir.

4. Tema enterprise preto/verde
- [x] Ajustar tokens globais em CSS (sem quebrar contraste/acessibilidade).
- [x] Aplicar em topbar, nav, cards, estados, badges e botoes.

## Arquivos alvo (estimado)

- `ui/src/ui/navigation.ts` (novas rotas)
- `ui/src/ui/app-render.ts`
- `ui/src/ui/views/docs.ts` (novo)
- `ui/src/ui/views/faq.ts` (novo)
- `ui/src/ui/i18n/*`
- `ui/src/styles/base.css`

## Testes

- [x] Render das novas rotas docs/faq.
- [x] Snapshot/assercoes de idioma pt-BR/en (chaves novas com fallback funcional).
- [x] Verificacao de contraste minimo em elementos principais.

## Criterio de aceite

- Operador consegue executar onboarding sem sair do frontend.
- Terminologia coerente com produto enterprise.
- Tema preto/verde aplicado com legibilidade.

## Fora de escopo

- Mudancas de contrato backend (ficam nos planos 1 e 2).
