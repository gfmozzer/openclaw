/**
 * Redis-backed backpressure metrics for Command Lanes.
 *
 * The in-memory command-queue.ts remains the source-of-truth for local
 * task execution (closures can't be serialized). This module publishes
 * per-lane depth counters to Redis so that:
 *  - The gateway /health endpoint can report global queue depth.
 *  - Load balancers can shed traffic when depth exceeds thresholds.
 *  - Multi-instance dashboards have visibility into per-node load.
 *
 * Metrics are best-effort (fire-and-forget) so a Redis hiccup never
 * blocks command execution.
 */
import { isRedisAvailable, getRedisClient } from "../gateway/stateless/adapters/redis/index.js";

const METRICS_KEY_PREFIX = "openclaw:lane:depth:";
const METRICS_TTL_SECONDS = 60;

/** Hostname/pid tag so dashboards can distinguish nodes. */
const nodeTag = `${process.env.HOSTNAME ?? "local"}:${process.pid}`;

function metricsKey(lane: string): string {
  return `${METRICS_KEY_PREFIX}${nodeTag}:${lane}`;
}

/**
 * Publish current queue depth for a lane.  Called after enqueue / dequeue.
 * Best-effort: silently swallows errors.
 */
export async function publishLaneDepth(lane: string, depth: number): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    const redis = getRedisClient();
    await redis.setex(metricsKey(lane), METRICS_TTL_SECONDS, String(depth));
  } catch {
    // Metrics are best-effort
  }
}

/**
 * Read all lane depths across all nodes.
 * Returns a Map of `node:lane → depth`.
 */
export async function readAllLaneDepths(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!isRedisAvailable()) {
    return result;
  }
  try {
    const redis = getRedisClient();
    const pattern = `${METRICS_KEY_PREFIX}*`;
    const keys = await redis.keys(pattern);
    if (keys.length === 0) {
      return result;
    }
    const values = await redis.mget(...keys);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = values[i];
      if (key && val != null) {
        const label = key.slice(METRICS_KEY_PREFIX.length);
        result.set(label, Number(val) || 0);
      }
    }
  } catch {
    // Best-effort
  }
  return result;
}

/**
 * Get total queue depth across all nodes for backpressure decisions.
 */
export async function getGlobalQueueDepth(): Promise<number> {
  const depths = await readAllLaneDepths();
  let total = 0;
  for (const d of depths.values()) {
    total += d;
  }
  return total;
}
