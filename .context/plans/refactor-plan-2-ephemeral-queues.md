---
title: "Plan 2: Ephemeral Queue Migration (Followup + Debounce + Command Lanes + Heartbeat)"
status: in_progress
priority: CRITICAL
parallelizable: true (com Plans 1 e 4, apos Plan 0)
depends_on: Plan 0 (Redis/BullMQ Foundation)
estimated_files: 8 modified, 4 new
owner: "agent-queues"
---

# Plan 2: Migracao de Filas Efemeras para Redis/BullMQ

## Objetivo

Substituir os 4 sistemas de filas em memoria que representam o MAIOR RISCO de perda
de dados e impossibilidade de escalar horizontalmente.

## Inventario dos Alvos

### Alvo 2A: FOLLOWUP_QUEUES (RISCO ALTO)

**Arquivos:**

- `src/auto-reply/reply/queue/state.ts` — Linha 21: `export const FOLLOWUP_QUEUES = new Map<string, FollowupQueueState>()`
- `src/auto-reply/reply/queue/drain.ts` — Linhas 27-132: `while` loop drenando items
- `src/auto-reply/reply/queue/enqueue.ts` — Enfileiramento de mensagens

**Problemas:**

- Map global em memoria — perda total no restart
- `while (queue.items.length > 0)` loop sem lock
- `queue.items.splice()` mutacao de array sem sincronizacao
- Debounce de 1s via `waitForQueueDebounce` — sem persistencia
- Sem backpressure — fila cresce sem limite
- Single-instance — sessoes fixadas a um pod

**Dados em jogo:**

```typescript
FollowupQueueState = {
  items: FollowupRun[];          // Mensagens pendentes
  draining: boolean;
  lastEnqueuedAt: number;
  mode: "batch" | "collect";
  debounceMs: 1000;
  cap: 20;
  dropPolicy: QueueDropPolicy;
  droppedCount: number;
  summaryLines: string[];
}
```

### Alvo 2B: Inbound Debouncer (RISCO MEDIO)

**Arquivo:** `src/auto-reply/inbound-debounce.ts`

- Linha 48: `const buffers = new Map<string, DebounceBuffer<T>>()`
- Linha 79: `setTimeout` para flush de buffer
- Buffer por canal sem limite de tamanho
- `timer.unref()` — nao mantem processo vivo, mas perde dados

**Dados em jogo:**

```typescript
DebounceBuffer<T> = {
  items: T[];                    // Mensagens acumuladas
  timeout: NodeJS.Timeout | null;
}
```

### Alvo 2C: Command Lanes (RISCO ALTO)

**Arquivo:** `src/process/command-queue.ts`

- Linha 38: `const lanes = new Map<string, LaneState>()`
- Linha 74: `while` loop com `queue.shift()` — FIFO sem persistencia
- Fire-and-forget async com `void`
- Sem backpressure — fila cresce sem limite
- `nextTaskId` global — nunca resetado

**Dados em jogo:**

```typescript
LaneState = {
  queue: QueueEntry[];           // Tarefas pendentes
  activeTaskIds: Set<number>;    // Em execucao
  maxConcurrent: number;
  draining: boolean;
  generation: number;
}
```

### Alvo 2D: Heartbeat Wake (RISCO ALTO)

**Arquivo:** `src/infra/heartbeat-wake.ts`

- Linha 29: `const pendingWakes = new Map<string, PendingWakeReason>()`
- Linha 130: `setTimeout` para coalescing (250ms)
- Linha 149-165: `for` loop batch processing
- Prioridade por tipo de wake (RETRY=0, INTERVAL=1, DEFAULT=2, ACTION=3)
- Retry com delay fixo de 1s — sem backoff exponencial

---

## Tarefas

### T2.1 — Adapter BullMQ para Followup Queue

**Arquivo:** `src/auto-reply/reply/queue/bullmq-followup-queue.ts` (CRIAR)

Substitui `FOLLOWUP_QUEUES` Map por BullMQ queue:

```typescript
import {
  createQueue,
  createWorker,
} from "../../gateway/stateless/adapters/redis/index.js";

const followupQueue = createQueue("followup-drain");

// Enqueue: ao inves de FOLLOWUP_QUEUES.get(key).items.push(),
// adicionar job com delay (debounce) no BullMQ
export async function enqueueFollowup(
  key: string,
  run: FollowupRun,
  debounceMs = 1000,
) {
  await followupQueue.add(
    `followup:${key}`,
    { key, run },
    {
      delay: debounceMs, // Debounce nativo do BullMQ
      jobId: `followup:${key}:${Date.now()}`,
      removeOnComplete: { age: 300 }, // 5 min
    },
  );
}

// Worker: processa items da fila
export function startFollowupWorker(
  processor: (key: string, run: FollowupRun) => Promise<void>,
) {
  return createWorker(
    "followup-drain",
    async (job) => {
      await processor(job.data.key, job.data.run);
    },
    { concurrency: 5 },
  );
}
```

**Consideracoes:**

- O debounce do BullMQ (`delay`) substitui `waitForQueueDebounce`
- O `concurrency: 5` substitui o drain sequencial
- O BullMQ garante at-least-once delivery
- Items sobrevivem restart do processo

### T2.2 — Migrar state.ts e drain.ts para usar BullMQ

**Arquivo:** `src/auto-reply/reply/queue/state.ts` (MODIFICAR)

```typescript
// ANTES:
export const FOLLOWUP_QUEUES = new Map<string, FollowupQueueState>();

// DEPOIS:
// Remover Map global
// getFollowupQueue() passa a ser no-op ou retorna estado lido do Redis
// clearFollowupQueue() limpa jobs pendentes no BullMQ
```

**Arquivo:** `src/auto-reply/reply/queue/drain.ts` (MODIFICAR)

```typescript
// ANTES:
while (queue.items.length > 0 || queue.droppedCount > 0) {
  await waitForQueueDebounce(queue);
  // ... drain
}

// DEPOIS:
// O while loop e eliminado — o Worker do BullMQ faz o drain automaticamente
// scheduleFollowupDrain() se torna apenas um enqueue no BullMQ
```

**Arquivo:** `src/auto-reply/reply/queue/enqueue.ts` (MODIFICAR)

- `enqueueFollowup()` passa a chamar `followupQueue.add()` ao inves de push no array

### T2.3 — Adapter BullMQ para Inbound Debounce

**Arquivo:** `src/auto-reply/inbound-debounce.ts` (MODIFICAR)

Substituir o `Map<string, DebounceBuffer<T>>` + `setTimeout`:

```typescript
// ANTES:
const buffers = new Map<string, DebounceBuffer<T>>();
buffer.timeout = setTimeout(() => void flushBuffer(key, buffer), debounceMs);

// DEPOIS:
// Usar BullMQ com delay nativo para debounce
// Cada item enqueued com delay = debounceMs
// Worker faz o flush quando o delay expira
// Agrupamento por key via job name pattern
```

**Estrategia:** Usar BullMQ "debounce" feature (>= BullMQ 5.x) ou delayed jobs
com group key. Se a versao nao suportar debounce nativo, usar delayed job que
ao processar verifica se ha mais items recentes (batch read pattern).

### T2.4 — Adapter BullMQ para Command Lanes

**Arquivo:** `src/process/command-queue-bullmq.ts` (CRIAR)

Substitui `lanes` Map por BullMQ named queues:

```typescript
// Cada lane vira uma queue BullMQ separada
// Lane "main" → queue "command-lane:main"
// Lane "auth-probe:xyz" → queue "command-lane:auth-probe:xyz"

export function enqueueCommandInLane<T>(
  lane: string,
  task: () => Promise<T>,
  opts?: { warnAfterMs?: number },
): Promise<T> {
  // Serializar task como closure nao e possivel em BullMQ
  // Opcao 1: Manter command lanes in-memory (sao locais ao processo)
  // Opcao 2: Migrar para pattern de "job type" + "job data" serializavel
}
```

**NOTA IMPORTANTE:** Command lanes executam closures (`() => Promise<T>`) que
NAO sao serializaveis. Ha duas abordagens:

1. **Manter in-memory mas com backpressure** — Adicionar limite de tamanho,
   metricas, e circuit breaker. Nao migrar para Redis.
2. **Refatorar para jobs serializaveis** — Cada lane command vira um job type
   com dados serializaveis. MUITO mais trabalho.

**Recomendacao:** Opcao 1 para agora. Command lanes sao operacoes locais ao
processo (auth probes, request handling). Nao precisam ser distribuidas.
Adicionar: `maxQueueSize`, metricas, e warning quando fila cresce.

### T2.5 — Adapter Redis Pub/Sub para Heartbeat Wake

**Arquivo:** `src/infra/heartbeat-wake-redis.ts` (CRIAR)

Substitui `pendingWakes` Map + `setTimeout` coalescing:

```typescript
import { getRedisClient } from "../gateway/stateless/adapters/redis/index.js";

// Publicar wake request via Redis Pub/Sub
export async function requestHeartbeatWake(params: {
  reason?: string;
  agentId?: string;
  sessionKey?: string;
}) {
  const redis = getRedisClient();
  await redis.publish(
    "heartbeat:wake",
    JSON.stringify({
      ...params,
      requestedAt: Date.now(),
    }),
  );
}

// Subscriber: cada instancia escuta e processa wakes para seus agentes
export function subscribeHeartbeatWakes(
  handler: HeartbeatWakeHandler,
): () => void {
  const sub = getRedisClient().duplicate();
  sub.subscribe("heartbeat:wake");
  sub.on("message", async (_channel, message) => {
    const wake = JSON.parse(message);
    // Coalescing local: agrupar wakes recebidos em janela de 250ms
    // antes de executar handler
    await handler(wake);
  });
  return () => {
    sub.unsubscribe();
    sub.quit();
  };
}
```

**Consideracoes:**

- Pub/Sub garante que TODAS as instancias recebem o wake
- Cada instancia decide se o wake e relevante para seus agentes
- Coalescing local pode ser mantido (250ms buffer) para evitar flood

### T2.6 — Migrar heartbeat-wake.ts

**Arquivo:** `src/infra/heartbeat-wake.ts` (MODIFICAR)

```typescript
// ANTES (globals a eliminar):
let handler: HeartbeatWakeHandler | null = null;
const pendingWakes = new Map<string, PendingWakeReason>();
let timer: NodeJS.Timeout | null = null;

// DEPOIS:
// - Se REDIS_URL disponivel: usar heartbeat-wake-redis.ts
// - Se nao: manter comportamento atual (fallback in-memory)
// - Feature flag via env var ou runtime check
```

### T2.7 — Testes

**Arquivo:** `src/auto-reply/reply/queue/followup-queue.test.ts` (CRIAR)

- Enqueue + drain via BullMQ (mock ou redis-mock)
- Debounce: enqueue 3 items em 100ms, verificar que sao processados em batch
- Restart: enqueue, "crash" (close worker), restart, verificar items ainda la
- Backpressure: enqueue 1000 items, verificar comportamento

---

## Criterio de Done

- [ ] `FOLLOWUP_QUEUES` Map eliminado — zero estado global de fila
- [ ] Debounce de followup via BullMQ delay (nao setTimeout)
- [ ] Inbound debounce via BullMQ delayed jobs (nao setTimeout + Map)
- [ ] Heartbeat wake via Redis Pub/Sub (nao Map + setTimeout)
- [ ] Command lanes com backpressure e metricas (manter in-memory)
- [ ] Restart do gateway nao perde mensagens em fila
- [ ] Build compila sem erros
- [ ] Testes de followup queue passam

## Arquivos Tocados

| Arquivo                                               | Acao      | Conflito |
| ----------------------------------------------------- | --------- | -------- |
| `src/auto-reply/reply/queue/bullmq-followup-queue.ts` | CRIAR     | Nenhum   |
| `src/auto-reply/reply/queue/state.ts`                 | MODIFICAR | Nenhum   |
| `src/auto-reply/reply/queue/drain.ts`                 | MODIFICAR | Nenhum   |
| `src/auto-reply/reply/queue/enqueue.ts`               | MODIFICAR | Nenhum   |
| `src/auto-reply/inbound-debounce.ts`                  | MODIFICAR | Nenhum   |
| `src/process/command-queue.ts`                        | MODIFICAR | Nenhum   |
| `src/infra/heartbeat-wake-redis.ts`                   | CRIAR     | Nenhum   |
| `src/infra/heartbeat-wake.ts`                         | MODIFICAR | Nenhum   |
| `src/auto-reply/reply/queue/followup-queue.test.ts`   | CRIAR     | Nenhum   |

## Conflitos com Outros Planos

- **Plan 0:** DEPENDE — precisa de `getRedisClient()` e `createQueue()`
- **Plan 1:** NENHUM — Temporal toca arquivos diferentes
- **Plan 4:** NENHUM — Memory/TTS toca arquivos diferentes
