---
title: "Plan 3: Memory/QMD Intervals + TTS Cleanup Migration"
status: completed
priority: HIGH
parallelizable: true (com Plans 1 e 2, apos Plan 0)
depends_on: Plan 0 (Redis/BullMQ Foundation)
estimated_files: 4 modified, 1 new
owner: "agent-memory"
---

# Plan 3: Migrar setInterval/setTimeout de Memory, QMD e TTS

## Objetivo

Eliminar os `setInterval` e `setTimeout` usados para operacoes periodicas em
QMD Manager, Memory Sync e TTS cleanup. Estes sao RISCO MEDIO individualmente
mas juntos representam CPU desperdicada e estado volatil significativo.

## Inventario dos Alvos

### Alvo 3A: QMD Manager — setInterval para update periodico (RISCO MEDIO)

**Arquivo:** `src/memory/qmd-manager.ts`

- **Linha 213:** `this.updateTimer = setInterval(() => void this.runUpdate("interval"), intervalMs)`
  - Intervalo configuravel por agente
  - Cleanup na linha 597: `clearInterval(this.updateTimer)`

- **Linhas 726-741:** While loop de forced updates:
  ```typescript
  while (!this.closed && this.queuedForcedRuns > 0) {
    this.queuedForcedRuns -= 1;
    await this.runUpdate(`${reason}:queued`, true, { fromForcedQueue: true });
  }
  ```

- **Estado volatil:**
  - `private updateTimer: NodeJS.Timeout | null` — timer handle
  - `private pendingUpdate: Promise<void> | null` — update em andamento
  - `private queuedForcedUpdate: Promise<void> | null` — forced update promise
  - `private queuedForcedRuns: number = 0` — contador
  - `private embedBackoffUntil: number | null` — backoff state
  - `private embedFailureCount: number = 0` — failure counter
  - Maps de cache: `collectionRoots`, `docPathCache`, `exportedSessionState`

### Alvo 3B: Memory Manager Sync Ops — File watchers + timers (RISCO MEDIO)

**Arquivo:** `src/memory/manager-sync-ops.ts`

- **Estado volatil (linhas 117-131):**
  - `watchTimer: NodeJS.Timeout | null` — FS watch debounce
  - `sessionWatchTimer: NodeJS.Timeout | null` — session watch debounce (5s)
  - `intervalTimer: NodeJS.Timeout | null` — periodic sync
  - `dirty: boolean` — flag de mudanca pendente
  - `sessionsDirty: boolean` — flag de sessao modificada
  - `sessionsDirtyFiles: Set<string>` — arquivos modificados
  - `sessionPendingFiles: Set<string>` — arquivos pendentes
  - `sessionDeltas: Map<string, { lastSize, pendingBytes, pendingMessages }>` — deltas

- **Constante:** `SESSION_DIRTY_DEBOUNCE_MS = 5000` (linha 64)

### Alvo 3C: TTS Cleanup — setTimeout para limpeza (RISCO BAIXO)

**Arquivo:** `src/tts/tts-core.ts`

- **Linhas 500-512:**
  ```typescript
  export function scheduleCleanup(tempDir: string, delayMs = 5 * 60 * 1000) {
    const timer = setTimeout(() => {
      rmSync(tempDir, { recursive: true, force: true });
    }, delayMs);
    timer.unref();
  }
  ```
  - Fire-and-forget, nao mantem processo vivo
  - 5 minutos de delay
  - Se o processo morrer, arquivos temporarios ficam orfaos

- **Linhas 445, 549, 609:** `setTimeout` para abort de API calls
  - Estes sao per-request timeouts com cleanup (`clearTimeout`)
  - **NAO MIGRAR** — sao timeouts de HTTP request, nao scheduling

---

## Tarefas

### T3.1 — Substituir QMD setInterval por BullMQ repeatable job

**Arquivo:** `src/memory/qmd-manager.ts` (MODIFICAR)

```typescript
// ANTES (linha 212-218):
if (this.qmd.update.intervalMs > 0) {
  this.updateTimer = setInterval(() => {
    void this.runUpdate("interval").catch(...);
  }, this.qmd.update.intervalMs);
}

// DEPOIS:
// Opcao A: BullMQ repeatable job (se Redis disponivel)
if (redisAvailable && this.qmd.update.intervalMs > 0) {
  const queue = createQueue("qmd-update");
  await queue.add("qmd-update", { agentId: this.agentId }, {
    repeat: { every: this.qmd.update.intervalMs },
    jobId: `qmd-update:${this.agentId}`,
  });
}

// Opcao B: Manter setInterval como fallback (sem Redis)
// O setInterval continua funcionando em modo single-instance
```

**Worker:**
```typescript
createWorker("qmd-update", async (job) => {
  const manager = getQmdManagerForAgent(job.data.agentId);
  if (manager) {
    await manager.runUpdate("interval");
  }
});
```

**Consideracao:** O QMD manager e per-agent (cada agente tem sua instancia).
O BullMQ job precisa saber qual agente atualizar. Usar `agentId` no job data.

### T3.2 — Substituir forced update queue por BullMQ

**Arquivo:** `src/memory/qmd-manager.ts` (MODIFICAR)

```typescript
// ANTES (linhas 726-741):
private enqueueForcedUpdate(reason: string): Promise<void> {
  this.queuedForcedRuns += 1;
  if (!this.queuedForcedUpdate) {
    this.queuedForcedUpdate = this.drainForcedUpdates(reason).finally(() => {
      this.queuedForcedUpdate = null;
    });
  }
  return this.queuedForcedUpdate;
}

// DEPOIS:
// Quando Redis disponivel:
private async enqueueForcedUpdate(reason: string): Promise<void> {
  if (redisAvailable) {
    const queue = createQueue("qmd-update");
    await queue.add("qmd-forced-update", {
      agentId: this.agentId,
      reason,
    }, {
      priority: 1,  // Maior prioridade que updates regulares
      removeOnComplete: { age: 60 },
    });
    return;
  }
  // Fallback: comportamento atual
  this.queuedForcedRuns += 1;
  // ...
}
```

### T3.3 — Limpar Memory Sync timers redundantes

**Arquivo:** `src/memory/manager-sync-ops.ts` (MODIFICAR)

**Estrategia:** Os file watchers (`watchTimer`, `sessionWatchTimer`) sao
inherentemente locais ao processo — monitoram o filesystem local.
Em ambiente multi-pod, cada pod monitora seus proprios arquivos.

**O que migrar:**
- `intervalTimer` (periodic sync) → BullMQ repeatable job
  - Cada agente registra um job `memory-sync:${agentId}`
  - Worker chama `runSync()` quando o job dispara

**O que manter:**
- `watchTimer` e `sessionWatchTimer` — sao debounces de FS events, locais ao processo
- `sessionsDirtyFiles`, `sessionDeltas` — estado de tracking local
- `dirty`/`sessionsDirty` flags — signals locais

```typescript
// ANTES:
this.intervalTimer = setInterval(() => this.syncIfDirty(), syncIntervalMs);

// DEPOIS (quando Redis disponivel):
const queue = createQueue("memory-sync");
await queue.add("memory-sync", { agentId: this.agentId }, {
  repeat: { every: syncIntervalMs },
  jobId: `memory-sync:${this.agentId}`,
});
```

### T3.4 — Substituir TTS cleanup por BullMQ delayed job

**Arquivo:** `src/tts/tts-core.ts` (MODIFICAR)

```typescript
// ANTES (linhas 500-512):
export function scheduleCleanup(tempDir: string, delayMs = 5 * 60 * 1000) {
  const timer = setTimeout(() => {
    rmSync(tempDir, { recursive: true, force: true });
  }, delayMs);
  timer.unref();
}

// DEPOIS:
export async function scheduleCleanup(tempDir: string, delayMs = 5 * 60 * 1000) {
  if (redisAvailable) {
    const queue = createQueue("tts-cleanup");
    await queue.add("cleanup", { tempDir }, {
      delay: delayMs,
      removeOnComplete: true,
    });
    return;
  }
  // Fallback: comportamento atual
  const timer = setTimeout(() => {
    rmSync(tempDir, { recursive: true, force: true });
  }, delayMs);
  timer.unref();
}
```

**Worker:**
```typescript
createWorker("tts-cleanup", async (job) => {
  const { tempDir } = job.data;
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignorar erros de cleanup (arquivo ja deletado, etc)
  }
});
```

**NOTA:** A assinatura muda de sync para async. Verificar todos os call sites.

### T3.5 — Registrar workers no startup

**Arquivo:** `src/gateway/server.impl.ts` (MODIFICAR — minimo)

No startup, quando Redis disponivel, iniciar workers:

```typescript
if (redisAvailable) {
  // Workers para memory/QMD/TTS
  startQmdUpdateWorker();
  startMemorySyncWorker();
  startTtsCleanupWorker();
}
```

**NOTA:** Coordenar com Plan 0 que tambem toca server.impl.ts para shutdown.
Apenas adicionar startup de workers, nao conflitar com shutdown logic.

### T3.6 — Testes

**Arquivo:** `src/memory/qmd-manager-scheduling.test.ts` (CRIAR)

- QMD update: registrar repeatable job, verificar que executa
- Forced update: enqueue + verify priority
- TTS cleanup: schedule + verify file deleted apos delay
- Fallback: sem Redis, verificar que setInterval ainda funciona

---

## Criterio de Done

- [x] QMD `setInterval` substituido por BullMQ repeatable job (quando Redis disponivel)
- [x] QMD forced update queue via BullMQ (quando Redis disponivel)
- [x] Memory sync `intervalTimer` via BullMQ repeatable job (quando Redis disponivel)
- [x] TTS cleanup via BullMQ delayed job (quando Redis disponivel)
- [x] Fallback para comportamento atual quando Redis nao disponivel
- [x] Nenhuma funcionalidade perdida em modo single-instance
- [x] Build compila sem erros
- [x] API timeouts de TTS (linhas 445, 549, 609) NAO tocados

## Arquivos Tocados

| Arquivo | Acao | Conflito |
|---------|------|----------|
| `src/memory/qmd-manager.ts` | MODIFICAR | Nenhum |
| `src/memory/manager-sync-ops.ts` | MODIFICAR | Nenhum |
| `src/tts/tts-core.ts` | MODIFICAR | Nenhum |
| `src/gateway/server.impl.ts` | MODIFICAR (startup workers) | Plan 0 (shutdown) — coordenar |
| `src/memory/qmd-manager-scheduling.test.ts` | CRIAR | Nenhum |

## Conflitos com Outros Planos

- **Plan 0:** DEPENDE — precisa de `createQueue()` e `createWorker()`
- **Plan 0 + Plan 3 em server.impl.ts:** Plan 0 adiciona shutdown, Plan 3 adiciona startup de workers. Nao conflitam (secoes diferentes do arquivo).
- **Plan 1:** NENHUM — Temporal toca cron, nao memory/tts
- **Plan 2:** NENHUM — Queues toca auto-reply/process/infra, nao memory/tts

## Decisoes Arquiteturais

### Por que manter fallback in-memory?

O sistema precisa funcionar em modo dev sem Redis (single-instance, `pnpm dev`).
Cada substituicao deve ter um `if (redisAvailable)` guard com fallback para o
comportamento atual. Isso permite:

1. Dev local sem Redis
2. Testes unitarios sem Redis
3. Migracao gradual em producao

### Por que NAO migrar file watchers?

File watchers (`FSWatcher`) sao inherentemente locais — monitoram o filesystem
do pod onde rodam. Em multi-pod, cada pod observa seus proprios arquivos.
Migrar watchers para Redis nao faz sentido; o que faz sentido e ter um
servico centralizado de storage (Prisma/Postgres) que elimina a necessidade
de watchers no futuro. Isso e escopo de outro plano.

### Por que mudar TTS cleanup de sync para async?

A funcao `scheduleCleanup` original e fire-and-forget via `setTimeout`. A versao
BullMQ precisa ser `async` para enfileirar o job. Call sites devem ser auditados
para garantir que o `await` e tratado (ou usar `.catch(() => {})` se fire-and-forget).
