---
title: "Frontend Enterprise Master Plan (Chat-First + Admin Console)"
status: completed
priority: CRITICAL
updated: 2026-02-22
owner: "frontend-architect"
---

# Master Plan: Frontend Enterprise

## Objetivo

Levar o frontend de "assistente pessoal" para "plataforma enterprise" com:
- portal cliente chat-first
- console admin de operacao
- UX alinhada ao backend distribuido (Temporal, Redis, S3, Postgres, Swarm)

## Escopo dos planos filhos

1. `front-plan-0-foundation-and-mode-separation.md`
2. `front-plan-1-chat-portal-and-rich-renderers.md`
3. `front-plan-2-admin-ops-jobs-swarm-skills.md`
4. `front-plan-3-docs-faq-i18n-theme-and-polish.md`

Status de execucao:
- `front-plan-0-foundation-and-mode-separation.md`: completed
- `front-plan-1-chat-portal-and-rich-renderers.md`: completed
- `front-plan-2-admin-ops-jobs-swarm-skills.md`: completed
- `front-plan-3-docs-faq-i18n-theme-and-polish.md`: completed

## Dependencias

- Plan 0 e pre-requisito para 1, 2 e 3.
- Plan 1 depende de contratos backend de portal (`chat.portal.contract`, `chat.portal.stack.status`).
- Plan 2 depende de CRUDs e telemetria de jobs/swarm/skills.
- Plan 3 pode rodar paralelo com fim do Plan 1 e 2.

## Paralelizacao

- Sequencial: Plan 0
- Paralelo: Plan 1 + Plan 2
- Paralelo: Plan 3 (inicia quando Plan 0 estiver estavel)

## Criterio de pronto (programa completo)

- Portal cliente nao exibe telas sensiveis de operacao.
- Console admin cobre jobs, swarm, canais e skills externas com dados reais.
- Nenhuma tela critica com dados hardcoded/placeholder.
- UX e linguagem em PT-BR e EN (i18n funcional).
- Tema enterprise padrao preto/verde aplicado de forma consistente.
- FAQ/docs in-app suficientes para operacao sem leitura de codigo.
- Skills externas com cadastro endpoint/politica e teste de conectividade no painel de Skills.

## Risco principal

- Misturar mudanca visual com mudanca de contrato backend no mesmo PR.

## Mitigacao

- Isolar por plano e por "feature flags" de UI.
