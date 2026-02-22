---
status: revised
generated: 2026-02-22
revised: 2026-02-22
revision_reason: Auditoria completa do codebase revelou implementação parcial significativa já existente — plano original estava desatualizado e propunha trabalho duplicado e arquitetura incorreta.
---

# Planejamento: Integração do Temporal.io no OpenClaw

> **AVISO AO AGENTE:** Este plano foi reescrito após auditoria do codebase em 2026-02-22.
> O plano original propunha instalar o SDK do Temporal e criar um driver do zero.
> Isso está **ERRADO** — a infraestrutura já existe com uma arquitetura diferente da proposta.
> Leia a seção "Decisão Arquitetural" antes de escrever qualquer código.

---

## Decisão Arquitetural (Imutável)

O Gateway **NÃO usa o SDK do Temporal diretamente** (`@temporalio/client`).
A integração segue o padrão de **proxy HTTP**: o Gateway faz chamadas REST para um serviço
intermediário chamado **Temporal Orchestrator Bridge**, que por sua vez conversa com o Temporal Server.

```
Agent Tool (cron-tool.ts)
    ↓ RPC via Gateway
Gateway (cron.ts server-methods)
    ↓ HTTP REST
Temporal Orchestrator Bridge  ←──── serviço externo, NÃO está neste repo
    ↓ Temporal SDK (gRPC)
Temporal Server (porta 7233)
    ↓ task queue
Temporal Worker (executa Workflows + Activities)
```

**Por quê este padrão?**
- Multi-tenancy: isolamento por tenant no bridge, não no SDK.
- Segurança: o Gateway nunca abre gRPC direto para o cluster Temporal.
- Testabilidade: o adapter `InMemory` elimina dependência do Temporal em testes.

**Consequência direta:** NÃO instalar `@temporalio/client`, `@temporalio/worker`, etc.
no `package.json` raiz. O SDK pertence ao Worker Process e ao Bridge (serviços separados).

---

## Casos de Uso dos Agentes

1. **Supervisor acordando Workers (Recorrência):** Supervisor cria agendamento recorrente (toda segunda-feira às 07:00) via `cron.add` com papel `supervisor`, apontando para um `targetAgentId` worker do mesmo team.
2. **Scraping / Coleta Contínua:** Agente de pesquisa cria schedule a cada 1 hora via `cron.add` com `{ kind: "every", everyMs: 3600000 }`.
3. **Workflows Longos Assíncronos (Relatórios):** Agente recebe pedido pesado, chama `cron.add` com `workflowKind: "report_dispatch"` e responde ao usuário sem bloquear. Quando o Temporal conclui, faz callback para `cron.callback`, que entrega o `pullResumeSignal` ao agente.
4. **Follow-ups Temporizados:** Agente cria job único (`{ kind: "at", at: "2026-02-25T10:00:00Z" }`) para checar caixa após 3 dias sem resposta.

---

## Inventário: O que já existe no codebase

### Contrato e Adapters — 100% implementados, NÃO reescrever

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `src/gateway/stateless/contracts/scheduler-orchestrator.ts` | ✅ COMPLETO | Interface `SchedulerOrchestrator` com 9 métodos |
| `src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.ts` | ✅ COMPLETO | Adapter HTTP proxy — chama o bridge externo via REST |
| `src/gateway/stateless/adapters/in-memory/in-memory-scheduler-orchestrator.ts` | ✅ COMPLETO | Adapter in-memory para dev/testes (todos os 9 métodos) |
| `src/gateway/cron-orchestration-mode.ts` | ✅ COMPLETO | Resolve `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal\|local` |
| `src/gateway/stateless/runtime.ts` | ✅ COMPLETO | Injeta `schedulerOrchestrator` nas deps do runtime |
| `scripts/migrate-cron-to-temporal.ts` | ✅ COMPLETO | Migração `jobs.json` → Temporal com `--dry-run` |
| `src/agents/tools/cron-tool.ts` | ✅ COMPLETO | Tool MCP para agentes (actions: status/list/add/update/remove/run/runs/wake) |
| `.context/providers/temporal-io.md` | ✅ COMPLETO | Documentação do padrão de integração |

### Interface `SchedulerOrchestrator` — Métodos e status de conexão nos RPCs

O contrato tem 9 métodos. Os adapters os implementam. Os RPCs do Gateway ainda NÃO os chamam todos:

| Método do contrato | RPC do Gateway | Status da conexão |
|--------------------|---------------|-------------------|
| `registerWorkflow()` | `cron.add` | ✅ Conectado |
| `cancelWorkflow()` | `cron.remove` | ✅ Conectado |
| `recordWorkflowCallback()` | `cron.callback` | ✅ Conectado |
| `pullResumeSignal()` | `cron.resume.pull` | ✅ Conectado |
| `getWorkflow()` | `cron.status` (parcial) | ⚠️ Parcial |
| `getStatus()` | `cron.status` | ⚠️ Parcial |
| `listWorkflows()` | `cron.list` | ❌ NÃO conectado |
| `updateWorkflow()` | `cron.update` | ❌ NÃO conectado |
| `triggerWorkflow()` | `cron.run` | ❌ NÃO conectado |
| `getWorkflowHistory()` | `cron.runs` | ❌ NÃO conectado |

### Variáveis de Ambiente (já documentadas no `.env.example`)

```bash
OPENCLAW_CRON_ORCHESTRATION_MODE=temporal        # habilita modo Temporal
OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT=http://temporal-orchestrator:8080
OPENCLAW_TEMPORAL_ORCHESTRATOR_AUTH_TOKEN=...    # Bearer token para o bridge
OPENCLAW_TEMPORAL_ORCHESTRATOR_TIMEOUT_MS=15000  # timeout das chamadas HTTP
OPENCLAW_TEMPORAL_CALLBACK_SECRET=...            # HMAC secret para validar callbacks
```

> **ATENÇÃO:** O plano original propunha `TEMPORAL_HOST` e `TEMPORAL_NAMESPACE`.
> Esses nomes estão **ERRADOS** para este projeto. Usar exclusivamente `OPENCLAW_TEMPORAL_*`.

### Planos Relacionados — NÃO recriar o que já está planejado

- `.context/plans/refactor-plan-1-temporal-cron.md` — **CRÍTICO, PENDENTE.** Detalha a substituição do cron fake (`src/cron/service/timer.ts` com `setTimeout`) pelo Temporal. As tarefas T1.1 (contrato), T1.2 (adapter node), T1.3 (adapter in-memory) e T1.6 (script de migração) já foram concluídas. **Faltam T1.4 (RPCs), T1.5 (server-cron.ts) e T1.7 (testes)** — são exatamente os Gaps 1, 2 e 4 deste plano.
- `.context/plans/temporal-supervisor-worker-scheduling.md` — Política de autorização supervisor/worker já documentada e implementada em `src/gateway/stateless/scheduler-policy.ts`. Não tocar.

---

## O que Genuinamente Falta (Gaps Reais)

### Gap 1 — RPCs `cron.list`, `update`, `run`, `runs` não conectados ao Temporal ← CRÍTICO

**Arquivo:** `src/gateway/server-methods/cron.ts`

Os métodos `add`, `remove`, `callback` e `resume.pull` já têm branches `if (temporalMode)`.
Os seguintes **ainda caem no código local** mesmo quando `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`:

| RPC | Linha aprox. | Método do orquestrador | O que falta |
|-----|-------------|------------------------|-------------|
| `cron.list` | ~238 | `listWorkflows()` | Adicionar branch temporal; mapear `SchedulerWorkflowState[]` → `CronJob[]` |
| `cron.update` | ~408 | `updateWorkflow()` | Adicionar branch temporal; mapear `CronJobPatch` → `SchedulerWorkflowPatch` |
| `cron.run` | ~551 | `triggerWorkflow()` | Adicionar branch temporal |
| `cron.runs` | ~587 | `getWorkflowHistory()` | Adicionar branch temporal; mapear `SchedulerWorkflowExecution[]` → `CronRunLogEntry[]` |
| `cron.status` | ~267 | `getStatus()` | Complementar implementação parcial com `schedulerOrchestrator.getStatus()` |

**Padrão de implementação a seguir** (igual ao que já existe para `cron.add`):
```typescript
const cronOrchestrationMode = resolveCronOrchestrationMode();

if (cronOrchestrationMode === "temporal") {
  // chamar schedulerOrchestrator.<método>() e mapear retorno
  // retornar no formato que a UI espera (CronJob[], CronRunLogEntry[], etc.)
}
// else: código local existente (não modificar)
```

### Gap 2 — `server-cron.ts` ainda instancia `CronService` em modo Temporal

**Arquivo:** `src/gateway/server-cron.ts`

Em modo `temporal`, o `CronService` local (baseado em `setTimeout` e `jobs.json`) não deve
ser criado. A guarda `cron.start()` já existe parcialmente, mas o `CronService` ainda é instanciado.

**O que falta:**
- Quando `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`: não criar `CronService`, não armar timer, não ler `jobs.json`. O state de cron deve ser `null` ou um noop.
- Events de wake/callback chegam via `cron.callback` RPC (já existe), não via tick de timer.

**Verify:** Com `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal`, nenhum `setTimeout` de cron é criado — `src/cron/service/timer.ts` não é executado.

### Gap 3 — Testes dos RPCs em modo Temporal

**Arquivo a criar:** `src/gateway/server-methods/cron.temporal-crud.test.ts`

O arquivo `cron.temporal-scheduling-policy.test.ts` já testa autorização, mas não cobre os
RPCs que estão sendo adicionados (list/update/run/runs/status).

**Testes necessários:**
- `cron.list` em modo temporal retorna dados do `InMemorySchedulerOrchestrator`, não do `jobs.json`
- `cron.update` em modo temporal chama `updateWorkflow()` e o retorno é mapeado corretamente
- `cron.run` em modo temporal chama `triggerWorkflow()`
- `cron.runs` em modo temporal mapeia `SchedulerWorkflowExecution[]` → `CronRunLogEntry[]`
- `cron.status` em modo temporal usa `getStatus()` do orchestrator
- Usar `InMemorySchedulerOrchestrator` como stub (já está completo e funcional)

### Gap 4 — Worker Process Temporal (serviço separado)

O Worker que executa Workflows e Activities **não existe** no codebase.
É ele que o Temporal Server chama para despachar tarefas de fato.

> **DECISÃO NECESSÁRIA antes de implementar:** O Worker deve ser um serviço separado
> (produção, recomendado pelo Temporal) ou um processo Node.js filho inicializado pelo
> Gateway em dev/single-node? Aguardar aprovação do arquiteto.

**Escopo do Worker quando implementado:**
- SDK necessário: `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity` — instalar **no Worker**, não no Gateway.
- Activities a implementar: `deliverAgentMessage`, `probeAgentHeartbeat`, `dispatchReport`, `sendFollowUp`. Cada uma chama a API REST do Gateway.
- Workflows a implementar: `PassiveTriggerWorkflow`, `ReportDispatchWorkflow`, `ProactiveFollowupWorkflow`.
- Escutar `taskQueue: "openclaw-queue"` (ou via env `TEMPORAL_TASK_QUEUE`).
- Env vars do Worker: `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`.
- Localização sugerida: `apps/temporal-worker/` com `package.json` próprio.

### Gap 5 — Skill para orientar os Agentes

**Já existe:** `.context/providers/temporal-io.md` com exemplos de código.

**O que falta:** Skill de decisão orientando os agentes sobre:
- Quando usar `cron.add` vs. responder diretamente ao usuário.
- Qual `workflowKind` usar em cada caso (`report_dispatch`, `passive_trigger`, `proactive_followup`).
- Como interpretar o `pullResumeSignal` após um callback assíncrono.
- Qual tipo de schedule usar: `cron` (expressão), `every` (intervalo), `at` (pontual).
- Exemplos completos dos 4 casos de uso desta spec.

---

## Tasks Priorizadas

### Fase 1 — Conectar os RPCs ausentes ao Temporal ← CONCLUÍDA

> **Descoberto em 2026-02-22:** Todos os RPCs já estavam implementados no `cron.ts`.
> Nenhuma tarefa desta fase precisou ser executada.

- [x] **T1 — `cron.list` em modo temporal:** Implementado em linhas 262–282. Chama `listWorkflows()` e mapeia via `extractCronJobFromWorkflow()`.
- [x] **T2 — `cron.update` em modo temporal:** Implementado em linhas 467–526. Chama `updateWorkflow()` e mapeia `CronJobPatch` → `SchedulerWorkflowPatch`.
- [x] **T3 — `cron.run` em modo temporal:** Implementado em linhas 641–680. Chama `triggerWorkflow()`.
- [x] **T4 — `cron.runs` em modo temporal:** Implementado em linhas 707–742. Chama `getWorkflowHistory()` e mapeia para entries com `runAtMs`, `durationMs`, `status`.
- [x] **T5 — `cron.status` completo em modo temporal:** Implementado em linhas 302–319. Usa `getStatus()` do orchestrator.

### Fase 2 — Desacoplar `server-cron.ts` do timer local ← CONCLUÍDA (já estava ok)

> **Descoberto em 2026-02-22:** O `CronService` constructor é puramente em memória — sem I/O, sem `setTimeout`. O `start()` (que arma o timer e lê `jobs.json`) já está guardado em `server.impl.ts` linha 547. Zero ação necessária.

- [x] **T6 — `CronService` ocioso em modo temporal:** `cron.start()` bloqueado em `server.impl.ts:547` quando `cronOrchestrationMode === "temporal"`. O construtor apenas cria estado em memória (`createCronServiceState`). Zero `setTimeout` de `timer.ts` em modo temporal. **Verify:** Confirmado via inspeção de `src/cron/service.ts` e `src/cron/service/state.ts`.

### Fase 3 — Testes de modo Temporal nos RPCs ← CONCLUÍDA

- [x] **T7 — Testes dos RPCs:** Criado `src/gateway/server-methods/cron.temporal-crud.test.ts` (19 testes, todos passando). Cobre `status`, `list` (4 casos), `update` (3 casos), `run` (2 casos), `runs` (4 casos). Usa `InMemorySchedulerOrchestrator`. **Verify:** `pnpm test cron.temporal-crud.test.ts` → 19 passed.

### Fase 4 — Worker Process (aguardar decisão arquitetural)

- [ ] **T8 — Decisão sobre localização:** Definir se Worker é `apps/temporal-worker/` (processo separado) ou processo filho inicializado pelo Gateway. Registrar decisão em `.context/`.
- [ ] **T9 — Estrutura do Worker:** Criar pasta com `package.json` próprio e deps `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`.
- [ ] **T10 — Activities:** Implementar `deliverAgentMessage`, `probeAgentHeartbeat`, `dispatchReport`. Cada uma chama a API REST do Gateway.
- [ ] **T11 — Workflows:** Implementar `PassiveTriggerWorkflow`, `ReportDispatchWorkflow`, `ProactiveFollowupWorkflow`.
- [ ] **T12 — Bootstrap do Worker:** Entry point com `Worker.create({ workflowsPath, activities, taskQueue })` parametrizado por env vars. **Verify:** Worker sobe sem erros e aparece conectado no Temporal UI.

### Fase 5 — Skills para os Agentes ← CONCLUÍDA

- [x] **T13 — Skill de decisão Temporal:** Criado `skills/temporal-scheduling/SKILL.md`. Cobre: árvore de decisão (usar schedule vs. responder agora), 3 tipos de schedule (`every`/`cron`/`at`), 3 `workflowKind`, exemplos completos dos 4 casos de uso, tabela de gerenciamento, padrão async callback/resume.pull e anti-padrões.

---

## Critérios de Done

### MVP (Fases 1–3) ← CONCLUÍDO

- [x] `OPENCLAW_CRON_ORCHESTRATION_MODE=temporal` faz **todos** os RPCs funcionarem: `add`, `remove`, `list`, `update`, `run`, `runs`, `status`, `callback`, `resume.pull`.
- [x] `src/cron/service/timer.ts` **não é carregado** em modo temporal — zero `setTimeout` de cron (start() guardado).
- [x] `pnpm test` passa sem Temporal Server rodando (InMemory adapter) — 19 testes passando.
- [x] `pnpm build` — falha pré-existente na base (confirmado via `git stash` em 2026-02-22), **não causada pelas mudanças desta fase**. Nenhum erro TypeScript em `cron.temporal-crud.test.ts`.

### Completo (Fases 4–5)

- [ ] Worker Process sobe e aparece conectado no Temporal Server local. ← **aguarda decisão arquitetural**
- [ ] Agente consegue chamar `cron.add` e o job aparece no log do Temporal Server.
- [x] Skills documentam os 4 casos de uso com exemplos concretos de `workflowKind` e schedule.

---

## Arquivos a Tocar

| Arquivo | Ação | Fase |
|---------|------|------|
| `src/gateway/server-methods/cron.ts` | ✅ NÃO MODIFICADO (já implementado) | 1 |
| `src/gateway/server-cron.ts` | ✅ NÃO MODIFICADO (start() já guardado) | 2 |
| `src/gateway/server-methods/cron.temporal-crud.test.ts` | ✅ CRIADO — 19 testes | 3 |
| `skills/temporal-scheduling/SKILL.md` | ✅ CRIADO | 5 |
| `apps/temporal-worker/` | CRIAR | 4 (aguardar decisão) |

### Arquivos que NÃO devem ser tocados

| Arquivo | Motivo |
|---------|--------|
| `src/gateway/stateless/contracts/scheduler-orchestrator.ts` | Interface já completa com todos os 9 métodos |
| `src/gateway/stateless/adapters/node/temporal-scheduler-orchestrator.ts` | Adapter HTTP proxy já implementado |
| `src/gateway/stateless/adapters/in-memory/in-memory-scheduler-orchestrator.ts` | Adapter in-memory já completo |
| `scripts/migrate-cron-to-temporal.ts` | Script de migração já existe e funciona |
| `package.json` (raiz do Gateway) | NÃO adicionar `@temporalio/*` — SDK pertence ao Worker/Bridge |
| `src/gateway/stateless/scheduler-policy.ts` | Política supervisor/worker já implementada |
