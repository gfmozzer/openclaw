---
title: "Plan 2: Admin Ops (Jobs + Swarm + External Skills)"
status: completed
priority: HIGH
parallelizable: yes (apos Plan 0)
updated: 2026-02-22
owner: "frontend-ops"
---

# Plan 2: Enterprise Operations Console

## Objetivo

Consolidar as telas de operacao admin para jobs, swarm e skills externas com dados reais.

## Problemas atuais

- `Agents > Memory` e `Agents > Metrics` ainda placeholders/hardcoded.
- `Agents > Swarm` pede identidade manual (tenant/requester/role/scopes) na UI.
- `/cron` ainda comunica semantica de cron local (nao "jobs").
- Fluxo de skill externa nao e first-class.

## Entregas

1. Jobs console
- [x] Reestruturar aba `cron` para narrativa de jobs.
- [x] Exibir tipo de execucao: `temporal workflow` vs `short queue`.
- [x] Exibir status consolidado por job (active, paused, failed, retries).

2. Swarm UX sem identidade manual
- [x] Remover campos manuais de identidade da tela.
- [x] Usar identidade autenticada da conexao.
- Wizard de criacao/edicao de time:
  - [x] supervisor
  - [x] workers
  - [x] especialidades
  - [x] escopos permitidos

3. Memory e Metrics reais
- [x] Substituir placeholder de memory por dados reais via `agents.files.list/get` (workspace real), com fallback documentado para futuro RPC dedicado.
- [x] Substituir metricas hardcoded por metricas de runtime (via `system.metrics`, escopo global no momento).

4. Skills externas
- [x] Exibir status do adapter remoto (modo/transporte/endpoint/manifests) na UI de Skills.
- [x] Tela de cadastro de endpoint externo por skill/tool.
- Politica por agente:
  - [x] preferExternal
  - [x] fallbackInternal
  - [x] denyInternal
- [x] Tela de teste (request/response/error/latency).

## Arquivos alvo (estimado)

- `ui/src/ui/views/cron.ts`
- `ui/src/ui/views/agents-panels-swarm.ts`
- `ui/src/ui/controllers/swarm.ts`
- `ui/src/ui/views/agents-panels-memory.ts`
- `ui/src/ui/views/agents-panels-metrics.ts`
- `ui/src/ui/views/skills.ts`
- `ui/src/ui/controllers/skills.ts`

## Testes

- Jobs: render de status e acoes por papel.
- Swarm: CRUD sem input manual de identity.
- Skills externas: fluxo de validacao e erro.
- Memory/Metrics: carga de dados reais e estados vazios.

## Criterio de aceite

- Nenhuma tela de operacao critica com dados fake.
- Swarm configurado sem digitar tenant/scopes no formulario.
- Jobs representados como operacao enterprise (nao cron local).
- Skills externas com endpoint/politica/teste operacionais via `skills.update` + `skills.remote.test`.

## Dependencias backend

- Endpoints de memory browse/search/list
- Endpoints de metrics por agente
- Endpoints de registry/teste de tool externa (se ainda nao existirem, criar contrato)
