/**
 * BullMQ workers for Plan 3 (Memory/QMD intervals + TTS cleanup).
 *
 * These workers process jobs enqueued by:
 * - QmdMemoryManager (qmd-update queue)
 * - MemoryManagerSyncOps (memory-sync queue)
 * - scheduleCleanup in tts-core (tts-cleanup queue)
 */
import { rmSync } from "node:fs";
import type { Worker } from "bullmq";
import { createWorker } from "./bullmq-queue-factory.js";
import { createSubsystemLogger } from "../../../../logging/subsystem.js";

const log = createSubsystemLogger("bullmq-workers");

type QmdManagerLookup = (agentId: string) => Promise<{
  sync(params?: { reason?: string; force?: boolean }): Promise<void>;
} | null>;

type MemorySyncLookup = (agentId: string) => Promise<{
  sync(params?: { reason?: string; force?: boolean }): Promise<void>;
} | null>;

/**
 * Starts the TTS cleanup worker. This worker needs no external dependencies —
 * it simply deletes temp directories after a BullMQ delay.
 */
export function startTtsCleanupWorker(): Worker {
  return createWorker("tts-cleanup", async (job) => {
    const { tempDir } = job.data as { tempDir: string };
    if (!tempDir || typeof tempDir !== "string") {
      log.warn("tts-cleanup worker: missing tempDir in job data");
      return;
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (already deleted, permission issues, etc.)
    }
  });
}

/**
 * Starts the QMD update worker. Requires a lookup function that resolves
 * the QMD manager instance for a given agentId.
 */
export function startQmdUpdateWorker(lookup: QmdManagerLookup): Worker {
  return createWorker("qmd-update", async (job) => {
    const { agentId, reason, force } = job.data as {
      agentId: string;
      reason?: string;
      force?: boolean;
    };
    if (!agentId) {
      log.warn("qmd-update worker: missing agentId in job data");
      return;
    }
    const manager = await lookup(agentId);
    if (!manager) {
      // Let BullMQ retry instead of dropping work when manager resolution fails.
      throw new Error(`qmd-update worker: manager not found for agent ${agentId}`);
    }
    await manager.sync({ reason: reason ?? "bullmq", force: Boolean(force) });
  });
}

/**
 * Starts the memory sync worker. Requires a lookup function that resolves
 * the MemoryIndexManager for a given agentId.
 */
export function startMemorySyncWorker(lookup: MemorySyncLookup): Worker {
  return createWorker("memory-sync", async (job) => {
    const { agentId } = job.data as { agentId: string };
    if (!agentId) {
      log.warn("memory-sync worker: missing agentId in job data");
      return;
    }
    const manager = await lookup(agentId);
    if (!manager) {
      // Let BullMQ retry instead of dropping work when manager resolution fails.
      throw new Error(`memory-sync worker: manager not found for agent ${agentId}`);
    }
    await manager.sync({ reason: "bullmq-interval" });
  });
}

/**
 * Convenience: start all Plan 3 workers at once.
 * Returns an array of workers for shutdown cleanup.
 */
export function startPlan3Workers(params: {
  qmdLookup: QmdManagerLookup;
  memorySyncLookup: MemorySyncLookup;
}): Worker[] {
  const workers: Worker[] = [];
  workers.push(startTtsCleanupWorker());
  workers.push(startQmdUpdateWorker(params.qmdLookup));
  workers.push(startMemorySyncWorker(params.memorySyncLookup));
  log.info("Plan 3 BullMQ workers started (tts-cleanup, qmd-update, memory-sync)");
  return workers;
}
