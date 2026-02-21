---
status: filled
generated: 2026-02-21
title: "Enterprise Gap Closure Wave 2"
owner: "backend-specialist"
---

# Enterprise Gap Closure Wave 2

> Objetivo: fechar todos os gaps remanescentes do `17-enterprise-gap-report.md` sem deixar pendencias funcionais, de seguranca ou operacionais.

## Escopo total coberto
1. C0-01 trust boundary de identidade/tenant.
2. C0-02 callback/resume async com autenticacao e correlacao forte.
3. C0-03 runtime principal stateless ponta a ponta.
4. C0-04 enforcement RLS/Prisma por request.
5. C1-05 swarm directory distribuido.
6. C1-06 redis operacional + wiring de idempotencia/message bus.
7. C1-07 estrategia Temporal formalizada (bridge hardenizada ou SDK direto).
8. C1-08 paridade de `.env.example` + matriz de configuracao.
9. C1-09 contrato chat-first exposto no frontend/docs locais.
10. C2-10 tema/branding + i18n PT/EN.

## Orquestracao dos workflows
1. `18-enterprise-principal-and-trust-boundary.md` (bloqueador para backend).
2. `19-temporal-callback-hardening.md` (depende de 18).
3. `20-stateless-runtime-and-rls-e2e.md` (depende de 18; integra 19).
4. `21-enterprise-env-contract-and-ops-docs.md` (pode rodar paralelo a 20).
5. `22-chat-first-frontend-admin-and-branding.md` (depende de 20 e 21).

## Matriz de dependencia
| Workflow | Pode iniciar em paralelo? | Bloqueia quem |
| --- | --- | --- |
| 18 | nao | 19, 20 |
| 19 | nao (precisa 18) | 20 parcial |
| 20 | nao (precisa 18) | 22 |
| 21 | sim (apos 18) | 22 parcial |
| 22 | nao (precisa 20 + 21) | baseline final |

## Criterio de pronto global
1. Nenhum handler sensivel usa identidade vinda de payload para decisao final.
2. Callback async rejeita origem nao autenticada, replay e correlacao invalida.
3. Chat/session/memory/idempotency nao dependem de disco local.
4. Todas transacoes multi-tenant aplicam contexto `app.tenant_id`.
5. Swarm team, membership e scheduler state persistem em backend distribuido.
6. `.env.example` e docs cobrem 100% das variaveis enterprise obrigatorias e opcionais.
7. Frontend admin apresenta `chat.portal.contract`, stack status, FAQ/API local e fluxo de operacao.
8. Tema verde/preto e i18n PT/EN aplicados nos principais paines de operacao.

## Plano de execucao (PREVC)

### P - Plan
1. Congelar contratos de principal, callback token, async state machine e DTOs de swarm.
2. Criar ADR de estrategia Temporal final (bridge hardenizada vs SDK direto).
3. Definir matriz de permissao: actor/role/scope/resource/action.

### R - Review
1. Revisao de seguranca em trust boundary e callback.
2. Revisao de arquitetura em runtime stateless + RLS.
3. Revisao de contrato backend/frontend para portal chat-first.

### E - Execute
1. Implementar workflows 18-22.
2. Validar migracoes e adapters distribuidos.
3. Atualizar docs operacionais e runbooks.

### V - Verify
1. Suites unitarias/integracao/e2e executadas com evidencias.
2. Testes de isolamento cross-tenant e politicas de scheduler/supervisor-worker.
3. Smoke test local com Redis + MinIO + Postgres + Temporal bridge/SDK.

### C - Complete
1. Consolidar changelog tecnico dos gaps fechados.
2. Atualizar `project-overview.md`, `security.md`, `tooling.md` e `testing-strategy.md`.
3. Registrar backlog residual somente se nao-crtico e com plano claro.

## Evidencias obrigatorias por workflow
1. PR diff com arquivo de testes correspondente.
2. Log de comando de validacao (`pnpm tsgo`, `pnpm test`, `pnpm build`).
3. Captura de runtime metrics e eventos de auditoria relevantes.
4. Checklist de rollback por feature flag.
