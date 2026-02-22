import { Queue, Worker } from "bullmq";
import type { Processor, QueueOptions, WorkerOptions } from "bullmq";

/**
 * All valid BullMQ queue names in the system.
 * Each queue has a dedicated purpose — add names as new consumers are migrated from in-memory.
 *
 * Current targets per the refactor plan:
 * - followup-drain      → replaces FOLLOWUP_QUEUES Map + while-loop drain (auto-reply)
 * - inbound-debounce    → replaces scheduleTextFragmentFlush setTimeout (Telegram bot-handlers)
 * - tts-cleanup         → replaces scheduleCleanup setTimeout (tts-core)
 * - qmd-update          → replaces manager-sync-ops intervalTimer flush-to-disk
 * - memory-sync         → replaces in-memory sync operations that persist to Prisma
 * - heartbeat-wake      → future: replaces monitor.ts heartbeat setInterval
 * - command-lane        → future: replaces command-queue.ts polling loop
 */
export type QueueName =
  | "followup-drain"
  | "inbound-debounce"
  | "command-lane"
  | "heartbeat-wake"
  | "qmd-update"
  | "memory-sync"
  | "tts-cleanup";

function getRedisConnectionOpts(): { url: string; maxRetriesPerRequest: null; enableReadyCheck: boolean } {
  const url = process.env.OPENCLAW_REDIS_URL ?? "redis://localhost:6379";
  return {
    url,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  };
}

export function isRedisAvailable(): boolean {
  return !!process.env.OPENCLAW_REDIS_URL;
}

const DEFAULT_JOB_OPTIONS: QueueOptions["defaultJobOptions"] = {
  removeOnComplete: { age: 3600 }, // keep completed jobs for 1 hour
  removeOnFail: { age: 86400 }, // keep failed jobs for 24 hours for debugging
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
};

/**
 * Creates a BullMQ Queue with consistent, production-safe defaults.
 *
 * Passes the Redis config as a plain options object rather than an ioredis instance to avoid
 * ioredis version conflicts when pnpm resolves two different ioredis sub-versions.
 * BullMQ constructs its own internal ioredis client from these options.
 */
export function createQueue(name: QueueName): Queue {
  return new Queue(name, {
    connection: getRedisConnectionOpts(),
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
}

/**
 * Creates a BullMQ Worker for the given queue.
 * Sets concurrency to 1 by default to preserve ordering guarantees.
 */
export function createWorker(
  name: QueueName,
  processor: Processor,
  opts?: Partial<WorkerOptions>,
): Worker {
  const workerOpts: WorkerOptions = {
    connection: getRedisConnectionOpts(),
    concurrency: 1,
    ...opts,
  };
  return new Worker(name, processor, workerOpts);
}
