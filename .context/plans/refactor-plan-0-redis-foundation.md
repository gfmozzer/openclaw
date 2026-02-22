---
title: "Plan 0: Redis/BullMQ Foundation Layer"
status: pending
priority: BLOCKER (Plans 2 and 4 depend on this)
parallelizable: false (must complete before Plans 2 and 4 start)
estimated_files: 6 new, 2 modified
owner: "agent-foundation"
---

# Plan 0: Redis/BullMQ Foundation Layer

## Objetivo

Criar a camada de infraestrutura Redis + BullMQ que sera usada por todos os outros planos.
Este plano e BLOCKER — Plans 2 e 4 dependem dele. Plan 3 (Temporal) e independente.

## Pre-requisitos

- Redis rodando (local ou remoto)
- `npm install bullmq ioredis` (ou equivalente no pnpm)

---

## Tarefas

### T0.1 — Instalar dependencias

```bash
pnpm add bullmq ioredis
pnpm add -D @types/ioredis  # se necessario
```

### T0.2 — Criar Redis Connection Singleton

**Arquivo:** `src/gateway/stateless/adapters/redis/redis-connection.ts` (CRIAR)

```typescript
import { Redis } from "ioredis";

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    _redis = new Redis(url, {
      maxRetriesPerRequest: null, // BullMQ requirement
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return _redis;
}

export async function closeRedisClient(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
```

**Regras:**
- Singleton com lazy connect
- `maxRetriesPerRequest: null` e obrigatorio para BullMQ
- URL configuravel via `REDIS_URL`
- Metodo `close` para graceful shutdown

### T0.3 — Criar BullMQ Queue Factory

**Arquivo:** `src/gateway/stateless/adapters/redis/bullmq-queue-factory.ts` (CRIAR)

Abstrai criacao de queues BullMQ com defaults consistentes:

```typescript
import { Queue, Worker, QueueEvents } from "bullmq";
import { getRedisClient } from "./redis-connection.js";

export type QueueName =
  | "followup-drain"
  | "inbound-debounce"
  | "command-lane"
  | "heartbeat-wake"
  | "qmd-update"
  | "memory-sync"
  | "tts-cleanup";

export function createQueue(name: QueueName): Queue {
  return new Queue(name, {
    connection: getRedisClient(),
    defaultJobOptions: {
      removeOnComplete: { age: 3600 },    // 1h
      removeOnFail: { age: 86400 },       // 24h
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  });
}

export function createWorker(
  name: QueueName,
  processor: Parameters<typeof Worker>[1],
  opts?: Partial<ConstructorParameters<typeof Worker>[2]>,
): Worker {
  return new Worker(name, processor, {
    connection: getRedisClient(),
    concurrency: 1,
    ...opts,
  });
}
```

### T0.4 — Barrel Export

**Arquivo:** `src/gateway/stateless/adapters/redis/index.ts` (CRIAR)

```typescript
export { getRedisClient, closeRedisClient } from "./redis-connection.js";
export { createQueue, createWorker, type QueueName } from "./bullmq-queue-factory.js";
```

### T0.5 — Integrar no Runtime

**Arquivo:** `src/gateway/stateless/runtime.ts` (MODIFICAR)

- Adicionar modo `"redis"` ou flag `REDIS_URL` ao `StatelessBackendMode`
- No `createStatelessRuntimeDeps()`, inicializar Redis connection quando `REDIS_URL` presente
- Expor `redisAvailable: boolean` em `StatelessRuntimeDeps`

### T0.6 — Graceful Shutdown

**Arquivo:** `src/gateway/server.impl.ts` (MODIFICAR)

- No shutdown handler existente, chamar `closeRedisClient()`
- Garantir que workers BullMQ sao fechados antes do Redis

### T0.7 — Health Check

**Arquivo:** `src/gateway/stateless/adapters/redis/redis-health.ts` (CRIAR)

```typescript
import { getRedisClient } from "./redis-connection.js";

export async function checkRedisHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await getRedisClient().ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
```

---

## Env Vars

| Variavel | Default | Descricao |
|----------|---------|-----------|
| `REDIS_URL` | `redis://localhost:6379` | URL de conexao Redis |
| `BULLMQ_CONCURRENCY` | `1` | Workers concorrentes por queue |

## Criterio de Done

- [ ] `pnpm build` compila sem erros
- [ ] `getRedisClient()` conecta ao Redis local
- [ ] `createQueue("test")` cria queue BullMQ funcional
- [ ] `closeRedisClient()` fecha conexao limpo
- [ ] Health check retorna `{ ok: true }`
- [ ] Nenhum import circular introduzido

## Arquivos Tocados

| Arquivo | Acao |
|---------|------|
| `src/gateway/stateless/adapters/redis/redis-connection.ts` | CRIAR |
| `src/gateway/stateless/adapters/redis/bullmq-queue-factory.ts` | CRIAR |
| `src/gateway/stateless/adapters/redis/redis-health.ts` | CRIAR |
| `src/gateway/stateless/adapters/redis/index.ts` | CRIAR |
| `src/gateway/stateless/runtime.ts` | MODIFICAR |
| `src/gateway/server.impl.ts` | MODIFICAR |
| `package.json` | MODIFICAR (deps) |

## Conflitos com Outros Planos

**NENHUM** — este plano cria arquivos novos em `adapters/redis/` que nao existem.
Os outros planos so consomem o que este cria.
