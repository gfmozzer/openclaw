---
title: "Plan 1: Temporal Cron Migration"
status: pending
priority: CRITICAL
parallelizable: true (independente dos outros planos)
depends_on: NENHUM (Temporal ja esta na infra)
estimated_files: 4 modified, 2 new, 1 migration script
owner: "agent-temporal"
---

# Plan 1: Temporal Cron Migration — Matar o src/cron/ Falso

## Objetivo

Substituir o sistema de cron baseado em `jobs.json` + `setTimeout` pelo Temporal.io
que ja esta rodando na infra. O contrato `SchedulerOrchestrator` ja existe e tem
adapter Temporal parcialmente implementado.

## Inventario do Alvo (o que sera destruido)

### src/cron/service/timer.ts (701 linhas) — CORACAO DO PROBLEMA
- **Linha 183:** `setTimeout` principal — tick a cada 60s max
- **Linha 209:** Re-arm durante execucao de job
- **Linha 275:** `setTimeout` de timeout por job (10 min default)
- **Linha 307-319:** Worker pool com `for(;;)` e cursor compartilhado SEM LOCK
- **Linha 509:** Helper de delay para retry
- **Linha 515-536:** Loop infinito de retry de heartbeat

### src/cron/store.ts (63 linhas) + src/cron/service/store.ts (497 linhas)
- Leitura/escrita de `~/.openclaw/cron/jobs.json`
- JSON5 parse, migracao de campos legados
- Persiste em disco a cada mudanca de estado

### src/cron/service/run-log.ts (143 linhas)
- JSONL append-only por job em `runs/{jobId}.jsonl`
- Max 2MB por arquivo, 2000 linhas

### src/cron/service/ops.ts (~150 linhas)
- CRUD: start, stop, status, list, add, update, remove, run
- Locked operations via `locked.ts`

### src/cron/types.ts (131 linhas)
- CronJob, CronJobState, CronSchedule, CronPayload, CronDelivery
- MANTER — os tipos continuam validos, so mudam os stores

---

## Estado Atual da Integracao Temporal

### Ja existe:
- `src/gateway/stateless/contracts/scheduler-orchestrator.ts` (98 linhas)
  - Interface: `registerWorkflow`, `cancelWorkflow`, `getWorkflow`, `recordWorkflowCallback`, `pullResumeSignal`
- `src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.ts`
  - Implementacao parcial via Temporal Client
- `src/gateway/stateless/adapters/in-memory/in-memory-scheduler-orchestrator.ts`
  - Stub in-memory para dev/testes
- `src/gateway/cron-orchestration-mode.ts`
  - Resolve `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal|local`
- `src/gateway/server-methods/cron.ts` (840 linhas)
  - Ja tem branches `if (temporalMode)` para add, remove, callback, resume.pull

### Falta:
- `cron.list` nao funciona em modo temporal (linha 238-266 — so local)
- `cron.update` nao funciona em modo temporal (linha 408-464 — so local)
- `cron.run` nao funciona em modo temporal (linha 551-586 — so local)
- `cron.runs` nao funciona em modo temporal (linha 587-629 — so local)
- `cron.status` parcialmente (linha 267-295)
- Nao ha migracao de `jobs.json` → Temporal

---

## Tarefas

### T1.1 — Completar SchedulerOrchestrator para cobrir CRUD completo

**Arquivo:** `src/gateway/stateless/contracts/scheduler-orchestrator.ts` (MODIFICAR)

Adicionar metodos que faltam:

```typescript
// Adicionar ao interface SchedulerOrchestrator:

/** List all workflows for a tenant/agent */
listWorkflows(params: {
  tenantId: string;
  agentId?: string;
  includeDisabled?: boolean;
}): Promise<SchedulerWorkflowState[]>;

/** Update an existing workflow */
updateWorkflow(
  scope: SchedulerScope,
  patch: Partial<Pick<RegisterSchedulerWorkflowRequest, "schedule" | "payload" | "enabled" | "name" | "description">>,
): Promise<SchedulerWorkflowState | null>;

/** Force-execute a workflow now */
triggerWorkflow(scope: SchedulerScope): Promise<{ ok: boolean; reason?: string }>;

/** Get execution history */
getWorkflowHistory(
  scope: SchedulerScope,
  opts?: { limit?: number },
): Promise<SchedulerWorkflowExecution[]>;

/** Get scheduler status (global) */
getStatus(): Promise<{ connected: boolean; activeWorkflows: number }>;
```

### T1.2 — Implementar metodos no Temporal Adapter

**Arquivo:** `src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.ts` (MODIFICAR)

Implementar cada metodo novo usando Temporal Client:
- `listWorkflows` → `client.workflow.list()` com query por tenantId
- `updateWorkflow` → `client.schedule.update()` ou cancel+register
- `triggerWorkflow` → `client.schedule.trigger()`
- `getWorkflowHistory` → `client.workflow.list()` filtrado por completed
- `getStatus` → `client.connection.healthCheck()` + count

### T1.3 — Implementar metodos no InMemory Adapter (para testes)

**Arquivo:** `src/gateway/stateless/adapters/in-memory/in-memory-scheduler-orchestrator.ts` (MODIFICAR)

Implementar os mesmos metodos com `Map<string, ...>` para que os testes funcionem
sem Temporal rodando.

### T1.4 — Migrar RPC methods para modo Temporal

**Arquivo:** `src/gateway/server-methods/cron.ts` (MODIFICAR)

Para cada metodo que hoje so funciona em modo local:

```
cron.list (linha 238):
  → Em modo temporal: chamar schedulerOrchestrator.listWorkflows()
  → Mapear SchedulerWorkflowState[] → CronJob[] para compatibilidade com UI

cron.update (linha 408):
  → Em modo temporal: chamar schedulerOrchestrator.updateWorkflow()
  → Mapear patch para formato Temporal

cron.run (linha 551):
  → Em modo temporal: chamar schedulerOrchestrator.triggerWorkflow()

cron.runs (linha 587):
  → Em modo temporal: chamar schedulerOrchestrator.getWorkflowHistory()
  → Mapear para CronRunLogEntry[]

cron.status (linha 267):
  → Em modo temporal: chamar schedulerOrchestrator.getStatus()
  → Mapear para CronStatus
```

**IMPORTANTE:** Manter compatibilidade com o modo local durante transicao.
O modo e resolvido por `OPENCLAW_CRON_ORCHESTRATION_MODE`.

### T1.5 — Desacoplar server-cron.ts do CronService local

**Arquivo:** `src/gateway/server-cron.ts` (MODIFICAR)

- Quando `cronOrchestrationMode === "temporal"`:
  - NAO instanciar `CronService`
  - NAO chamar `cron.start()` (ja tem esse guard na linha 546-548)
  - NAO armar timer
  - Event broadcasting deve vir via webhook callback, nao via timer tick
- Manter `GatewayCronState` mas com `cron: null` em modo temporal

### T1.6 — Script de migracao jobs.json → Temporal

**Arquivo:** `scripts/migrate-cron-to-temporal.ts` (CRIAR)

```typescript
// Pseudocodigo:
// 1. Ler ~/.openclaw/cron/jobs.json
// 2. Para cada job enabled:
//    a. Converter CronSchedule → Temporal Schedule
//    b. Converter CronPayload → Temporal workflow input
//    c. Chamar schedulerOrchestrator.registerWorkflow()
// 3. Reportar sucesso/falha por job
// 4. Renomear jobs.json → jobs.json.migrated (backup)
```

**Conversoes necessarias:**
- `{ kind: "cron", expr: "0 7 * * *" }` → Temporal CronSchedule
- `{ kind: "every", everyMs: 3600000 }` → Temporal IntervalSpec
- `{ kind: "at", at: "2026-03-01T07:00:00Z" }` → Temporal one-shot workflow

### T1.7 — Testes

**Arquivo:** `src/gateway/stateless/scheduler-orchestrator.test.ts` (CRIAR)

Testes usando InMemory adapter:
- registerWorkflow + listWorkflows
- updateWorkflow (enable/disable, change schedule)
- triggerWorkflow
- cancelWorkflow + verify removed from list
- getWorkflowHistory
- Cross-tenant isolation (tenant A nao lista workflows de tenant B)

---

## Criterio de Done

- [ ] `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal` faz TODOS os RPCs funcionarem
- [ ] `cron.list` retorna jobs do Temporal (nao do jobs.json)
- [ ] `cron.add` cria workflow no Temporal
- [ ] `cron.update` modifica workflow no Temporal
- [ ] `cron.remove` cancela workflow no Temporal
- [ ] `cron.run` dispara workflow no Temporal
- [ ] `cron.runs` retorna historico do Temporal
- [ ] UI de cron funciona identicamente em ambos os modos
- [ ] Script de migracao converte jobs.json → Temporal
- [ ] Testes passam com InMemory adapter
- [ ] `src/cron/service/timer.ts` NAO e carregado em modo temporal (zero setTimeout)
- [ ] Build compila sem erros

## Arquivos Tocados

| Arquivo | Acao | Conflito |
|---------|------|----------|
| `src/gateway/stateless/contracts/scheduler-orchestrator.ts` | MODIFICAR | Nenhum |
| `src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.ts` | MODIFICAR | Nenhum |
| `src/gateway/stateless/adapters/in-memory/in-memory-scheduler-orchestrator.ts` | MODIFICAR | Nenhum |
| `src/gateway/server-methods/cron.ts` | MODIFICAR | Nenhum |
| `src/gateway/server-cron.ts` | MODIFICAR | Nenhum |
| `scripts/migrate-cron-to-temporal.ts` | CRIAR | Nenhum |
| `src/gateway/stateless/scheduler-orchestrator.test.ts` | CRIAR | Nenhum |

## Conflitos com Outros Planos

**NENHUM** — Este plano e 100% independente:
- Nao toca Redis/BullMQ (usa Temporal)
- Nao toca auto-reply/, process/, infra/, memory/, tts/
- Os unicos arquivos compartilhados (runtime.ts, server.impl.ts) nao sao modificados aqui
