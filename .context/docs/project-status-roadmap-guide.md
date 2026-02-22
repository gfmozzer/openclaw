---
type: doc
name: project-status-roadmap-guide
description: Guia de status do projeto e roadmap operacional para acompanhar implementações e gaps
category: operations
generated: 2026-02-23
status: filled
scaffoldVersion: "2.0.0"
---

# Project Status & Roadmap Guide

## Objetivo

Este documento responde a uma lacuna atual do frontend:
- o dashboard mostra **status operacional/runtime** (health, stack, drivers, canais, jobs)
- mas **nao mostra** o status dos **planos/workflows de desenvolvimento** (`.context/plans`, `.agent/workflows`)

Aqui fica o mapa canônico para acompanhar:
- o que já foi entregue
- o que está em progresso
- o que ainda depende de outros planos/agentes

## O que o frontend mostra hoje (status operacional)

O frontend atual (Control UI) está atualizado principalmente para **observabilidade e operação**:

- **Top badges / Stack**
  - Health
  - Backend mode
  - Redis / S3 / Postgres probes
  - Stack summary
- **Drivers / Providers**
  - runtime de drivers carregados
  - credenciais
  - smoke tests
  - rotas de modelos
- **Cron / Jobs**
  - agendamento
  - histórico / execução
  - modo de orquestração
- **Swarm**
  - times supervisor/worker
  - inventário de runtime/capacidades (parcial)
- **FAQ**
  - agora inclui seção de `Overrides & Economia`

## O que o frontend ainda nao mostra (status de engenharia/roadmap)

Hoje o frontend **nao exibe**:
- status dos planos em `.context/plans/*.md`
- status dos workflows em `.agent/workflows/*.md`
- fases PREVC por plano
- quais planos estão bloqueados por dependência
- quais entregas foram feitas por agente X/Y

Esse acompanhamento ainda está em:
- documentação (`.context/docs/*`)
- markdown de planos (`.context/plans/*`)
- outputs de workflow (`.agent/workflows/*.output.md`)

## Fonte de verdade (por tipo)

### 1. Status arquitetural / roadmap
- `.context/plans/enterprise-runtime-governance-master-plan.md`
- demais planos filhos `enterprise-runtime-plan-*`

### 2. Status de execução por workflow
- `.agent/workflows/*.md`
- `.agent/workflows/*.output.md`

### 3. Estado operacional real do sistema
- Frontend (`/overview`, `/drivers`, `/providers`, `/cron`, `/jobs`, `/swarm`, `/faq`)
- RPCs (`chat.portal.stack.status`, `runtime.metrics`, `drivers.*`, `swarm.*`, `cron.*`)

## Leitura recomendada (ordem)

1. **Roadmap/Master Plan**
- Comece em `enterprise-runtime-governance-master-plan.md`
- Entenda dependências e o que está em paralelo

2. **Plano específico**
- Abra o plano (`Plan 1`, `Plan 2`, `Plan 3`, etc.)
- Leia:
  - `status`
  - `Status de execucao (progresso atual)`
  - `Follow-ups`

3. **Validação no frontend**
- Verifique se a funcionalidade está operacional de fato
- Ex.: overrides/frontdoor -> FAQ + `/chat`/RPC; drivers/providers -> `/drivers`

4. **Outputs de workflow**
- Consulte os `.output.md` para evidências de execução e decisões

## Estado atual (resumo de alto nível)

### Concluídos / baseline entregue (nesta trilha de governance)
- **Plan 0**: contracts and request context (foundation)
- **Plan 3 (baseline)**: override source policy + trusted frontdoor + docs/FAQ

### Em progresso / dependentes de outros agentes
- **Plan 1**: identity / RBAC / ABAC / channel mapping
- **Plan 2**: delegation supervisor-worker + execution routing

### Dependências cruzadas importantes
- `Plan 3` hardening final depende de entitlements/scopes do `Plan 1`
- consolidação de docs finais (architecture/data-flow/security) depende do merge de `Plan 1` + `Plan 2`

## Como interpretar "concluído" vs "concluído baseline"

Neste projeto, alguns planos são marcados como **concluídos baseline** quando:
- contratos e fluxo principal foram implementados
- testes focados passam
- documentação operacional foi entregue

Mas ainda existem **follow-ups** de hardening/integração, por exemplo:
- assinatura/JWT/HMAC para claims
- policy fina por entitlements
- capability mapping avançado por provider

Isso é intencional para manter progresso paralelo sem travar a evolução.

## Proposta de evolução (futuro frontend)

Para o frontend mostrar status de projeto (não apenas runtime), a próxima evolução recomendada é criar uma aba:

- **Project Status / Roadmap**

Com dados de:
- `.context/plans/*` (status, prioridade, dependências)
- `.agent/workflows/*` (status, output links)
- resumo de testes/validações por plano

### MVP sugerido
- Leitura de um JSON gerado (snapshot) em vez de parsear markdown no browser
- Cards por plano com:
  - status
  - owner
  - progresso
  - bloqueios
  - links para docs e arquivos

## Checklist de uso (operador técnico)

- [ ] Verificar status operacional no frontend (stack/health/drivers/jobs)
- [ ] Verificar status de roadmap nos markdowns de plano
- [ ] Confirmar evidências em `.output.md` quando houver dúvida
- [ ] Validar funcionalidade real via RPC/UI (não confiar só no plano)
- [ ] Registrar follow-ups explicitamente ao marcar plano como concluído baseline

