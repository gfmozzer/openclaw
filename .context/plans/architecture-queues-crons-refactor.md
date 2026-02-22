---
title: "Refactoring Plan: Memory Queues & Internal Crons to Redis + Temporal"
status: approved
date: 2026-02-21
updated: 2026-02-21
owner: "architect-specialist"
---

# Refatoracao Arquitetural: Filas em Memoria e Crons Internos

## 1. O Problema Identificado (O "Falso Banco" e as Filas Volateis)

Durante uma auditoria profunda na arquitetura atual do bot, identificamos que o sistema tenta simular rotinas de orquestracao e filas (Message Queues) utilizando recursos estritos da memoria RAM do Node.js (`Map`, `while loops` assincronos) e falsos bancos de dados baseados em arquivos (`.json`).

Embora essa abordagem funcione para um script rodando em uma unica maquina, ela e **catastrofica para escalabilidade Enterprise**. Com ate 80 agentes orquestrados e multiplas instancias (pods) atras de um Load Balancer, a arquitetura atual resulta em:

1. **Race Conditions e Double Delivery:** Multiplas instancias abrirao o arquivo `jobs.json` simultaneamente.
2. **Starvation (Fome de Recursos):** Dezenas de `setInterval` rodando eternamente sugarao ciclos de CPU vitais da maquina, "travando" o sistema de forma invisivel.
3. **Perda de Dados Volateis:** Mensagens de clientes no meio de um debounce (esperando 2 segundos) sumirao irrevogavelmente se o Node.js reiniciar ou o pod sofrer um _kill_.
4. **Impossibilidade de escalar agentes:** 80 agentes gravando cron jobs no servidor via JSON e insustentavel. Cada agente-gerente precisa agendar tarefas recorrentes (ex: "acordar worker de distribuicao as 7h") sem depender do processo local.

---

## 2. Arquitetura Hibrida: Redis/BullMQ + Temporal.io

### Premissa: Temporal ja esta na infraestrutura

Temporal.io **ja esta implantado e operacional** na infra distribuida. Nao e uma proposta especulativa — e um servico estabelecido usado como sistema de gestao de aplicacoes. A integracao parcial ja foi feita (ver workflows 03/04 em `.agent/workflows/`).

### A. Redis + BullMQ (Motor Efemero / Tempo Real) — ~80% do volume

Cobre interacoes curtas e filas efemeras. BullMQ fornece delayed jobs, retries e crons simples sobre Redis sem infra adicional.

- **Uso para:** Debounce de mensagens, agrupamento de texto "digitando", filas de follow-up, flush de fragmentos, qualquer tarefa de ms a poucos minutos onde perda por crash e toleravel.
- **Vantagem:** Substitui `Map` + `while loop` + `setInterval` com garantias atomicas, sem adicionar complexidade operacional alem do Redis.

### B. Temporal.io (Orquestrador Duravel de Longo Prazo) — ~20% do volume, mas critico

Assume agendamentos reais e fluxos que nao podem falhar.

- **Uso para:** Workflows recorrentes de agentes (ex: "todo dia 7h, acorde o worker de distribuicao"), drip campaigns, sagas multi-step com compensacao, retries com backoff orquestrado.
- **Por que nao BullMQ aqui:** Workflows duraveis que duram dias/semanas precisam de estado hibernado persistente, visualizacao de execucao, e compensacao automatica. Temporal faz isso nativamente; BullMQ exigiria gambiarras.

---

## 3. Mapeamento Cirurgico do Codigo Afetado

### Contratos stateless ja existentes no fork

O fork enterprise ja possui uma camada de contratos plugaveis em `src/gateway/stateless/contracts/` com adapters em `adapters/in-memory/` e `adapters/prisma/`. A refatoracao DEVE se apoiar nesses contratos:

- `SchedulerOrchestrator` — interface que um `TemporalSchedulerOrchestrator` ou `BullMQSchedulerOrchestrator` substituiria diretamente no lugar do `InMemorySchedulerOrchestrator`
- `SessionStateStore` — ja tem adapter Prisma, isolamento por tenant
- `IdempotencyStore` — ja tem adapter Prisma para dedup de operacoes

O gateway usa **Hono + WebSocket** (nao NestJS). Qualquer novo adapter deve seguir o padrao existente de injecao via `runtime.ts` → `createStatelessRuntimeDeps()`.

### Alvo 1: Sistema "Cron" Falso → Temporal Schedules

- **Diretorios:** `src/cron/` (inteiro)
- **Mecanica a destruir:** Leitura/escrita do arquivo local `~/.openclaw/cron/jobs.json`
- **Timer a destruir:** Logica que recalcula milissegundos e roda `setTimeout` em `src/cron/service/timer.ts`
- **Substituicao:** `TemporalSchedulerOrchestrator` implementando `SchedulerOrchestrator` via Temporal Schedules API
- **Migracao:** Script que le dados orfaos de `jobs.json` e injeta via Temporal Schedule API

### Alvo 2: Fila em Memoria / Debounce → Redis + BullMQ

- **Diretorios:** `src/auto-reply/reply/queue/` (`enqueue.ts` e `drain.ts`)
- **Mecanica a destruir:** Buffer global `const FOLLOWUP_QUEUES = new Map()` que segura a thread local em um _while loop_
- **Substituicao:** BullMQ queue com delayed jobs para debounce

### Alvo 3: setInterval Loops → Redis ou eliminacao

Processos obscuros no sistema que rodam loops infinitos com `setInterval` puro:

| Modulo | Funcao | Destino |
|--------|--------|---------|
| `monitor.ts` | Heartbeat/watchdog a cada 10/30s | Redis pub/sub heartbeat |
| `qmd-manager.ts` / `manager-sync-ops.ts` | Flush de buffer para disco | BullMQ delayed job ou eliminacao (Prisma persiste direto) |
| `tts.ts` | `scheduleCleanup` de mp3 em disco | BullMQ delayed job |
| `bot-handlers.ts` (Telegram) | `scheduleTextFragmentFlush` debounce 1.5s | BullMQ delayed job |
| `tui.ts` | Repintura do Terminal | Manter (so executa em modo dev/CLI, nao em producao) |

---

## 4. Teste do Acido (Criterios de Roteamento)

Para orientar a nova implementacao, todo desenvolvedor deve responder:

**1. A tarefa sobrevive se o servidor for desligado da tomada?**

- Nao importa se perder (ex: Debounce / Agrupamento / Status de Typing) → **REDIS/BULLMQ**
- Sim, perda de dados causara problemas (ex: agendamento recorrente de agente) → **TEMPORAL**

**2. Qual o tempo de vida total da fila?**

- Segundos a poucos minutos → **REDIS/BULLMQ**
- Horas a meses → **TEMPORAL**

**3. Precisa de retentativas e backoffs orquestrados?**

- Sim, com compensacao e visibilidade de execucao → **TEMPORAL**
- Nao, e fail-fast → **REDIS/BULLMQ**

**4. E um agendamento recorrente criado por um agente?**

- Sim (ex: "todo dia 7h acorde o worker X") → **TEMPORAL** (nunca no servidor)
- Nao, e uma fila operacional do gateway → **REDIS/BULLMQ**

---

## 5. Fases de Execucao

### Fase 1 — Redis + BullMQ para filas efemeras (maior risco de perda de dados hoje)

1. Criar adapter `BullMQQueueAdapter` seguindo padrao de `src/gateway/stateless/adapters/`
2. Substituir `FOLLOWUP_QUEUES` (Map) por BullMQ queue com delayed jobs
3. Substituir `scheduleTextFragmentFlush` por BullMQ delayed job
4. Substituir `scheduleCleanup` (tts.ts) por BullMQ delayed job
5. **Criterio de done:** Zero `new Map()` usado como fila, zero `while` loop para drain

### Fase 2 — Temporal para crons de agentes (maior risco de escalabilidade)

1. Criar `TemporalSchedulerOrchestrator` implementando `SchedulerOrchestrator`
2. Conectar ao Temporal Server ja existente na infra
3. Migrar `src/cron/` inteiro para Temporal Schedules
4. Script de migracao: `jobs.json` → Temporal Schedule API
5. **Criterio de done:** Diretorio `src/cron/service/timer.ts` deletado, zero `setTimeout` para scheduling

### Fase 3 — Eliminacao dos setInterval residuais

1. `monitor.ts` heartbeat → Redis pub/sub ou health check endpoint
2. `qmd-manager.ts` flush → BullMQ ou eliminacao (dados ja vao pro Prisma)
3. **Criterio de done:** `grep -r "setInterval" src/` retorna apenas `tui.ts` (modo dev)

### Fase 4 — Validacao e cleanup

1. Testes de integracao: restart do gateway nao perde agendamentos
2. Teste de escala: 80 agentes com crons recorrentes via Temporal
3. Remover `src/cron/service/timer.ts` e dependencias de arquivo JSON
4. **Criterio de done:** Build limpo, zero dependencia de filesystem para estado

---

## 6. Justificativas e Desafios

**Por que fazer isso?**

- Um sistema Cloud/Multi-Tenant serio depende de instancias que podem subir ou cair a qualquer momento sem corromper a base ("Stateless APIs")
- Filas em memoria vinculam um cliente exclusivamente a UMA maquina. Se o Load Balancer redirecionar para outro pod, as regras de "Collect" da conversa perdem sincronia. Redis unifica essas transacoes numa camada unica atomica em <1ms de latencia
- 80 agentes gravando cron jobs no servidor e insustentavel — Temporal gerencia isso fora do processo Node.js
- Evita corrupcao local (arquivo .json do antigo cron travaria [File Lock] na segunda instancia)

**Desafios na execucao**

- O sistema hoje depende da arquitetura em memoria para rapidez. Os novos adapters (BullMQ/Temporal) via gateway Hono/WebSocket devem manter latencia baixa (Redis keep-alive, connection pooling)
- Script de migracao obrigatorio: dados orfaos de `jobs.json` em producao devem ser migrados para Temporal antes de deletar o modulo cron
- Fase de transicao: ambos os sistemas (antigo e novo) podem coexistir temporariamente via feature flag em `runtime.ts` (`OPENCLAW_SCHEDULER_BACKEND=temporal|inmemory`)

---

_(Fim do Plano Arquitetural — v2)_
