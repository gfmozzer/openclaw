import { getRedisClient } from "../../../gateway/stateless/adapters/redis/index.js";
import { applyQueueRuntimeSettings } from "../../../utils/queue-helpers.js";
import type { FollowupRun, QueueDropPolicy, QueueMode, QueueSettings } from "./types.js";

export type FollowupQueueState = {
  items: FollowupRun[];
  lastEnqueuedAt: number;
  mode: QueueMode;
  debounceMs: number;
  cap: number;
  dropPolicy: QueueDropPolicy;
  droppedCount: number;
  summaryLines: string[];
  lastRun?: FollowupRun["run"];
};

export const DEFAULT_QUEUE_DEBOUNCE_MS = 1000;
export const DEFAULT_QUEUE_CAP = 20;
export const DEFAULT_QUEUE_DROP: QueueDropPolicy = "summarize";

const getStateKey = (key: string) => `openclaw:followup:state:${key}`;

export async function getFollowupQueueState(key: string): Promise<FollowupQueueState | undefined>;
export async function getFollowupQueueState(key: string, settings: QueueSettings): Promise<FollowupQueueState>;
export async function getFollowupQueueState(key: string, settings?: QueueSettings): Promise<FollowupQueueState | undefined> {
  const redis = getRedisClient();
  const raw = await redis.get(getStateKey(key));
  
  if (raw) {
    const existing = JSON.parse(raw) as FollowupQueueState;
    if (settings) {
      applyQueueRuntimeSettings({
        target: existing,
        settings,
      });
    }
    return existing;
  }

  if (!settings) {
    return undefined;
  }

  const created: FollowupQueueState = {
    items: [],
    lastEnqueuedAt: 0,
    mode: settings.mode,
    debounceMs:
      typeof settings.debounceMs === "number"
        ? Math.max(0, settings.debounceMs)
        : DEFAULT_QUEUE_DEBOUNCE_MS,
    cap:
      typeof settings.cap === "number" && settings.cap > 0
        ? Math.floor(settings.cap)
        : DEFAULT_QUEUE_CAP,
    dropPolicy: settings.dropPolicy ?? DEFAULT_QUEUE_DROP,
    droppedCount: 0,
    summaryLines: [],
  };
  applyQueueRuntimeSettings({
    target: created,
    settings,
  });
  return created;
}

export async function saveFollowupQueueState(key: string, state: FollowupQueueState): Promise<void> {
  const redis = getRedisClient();
  // Ephemeral state, let's give it a generous TTL of 1 hour just in case it gets stuck
  await redis.setex(getStateKey(key), 3600, JSON.stringify(state));
}

export async function clearFollowupQueue(key: string): Promise<number> {
  return await clearFollowupQueueState(key);
}

export async function clearFollowupQueueState(key: string): Promise<number> {
  const cleaned = key.trim();
  if (!cleaned) {
    return 0;
  }
  const redis = getRedisClient();
  const raw = await redis.get(getStateKey(cleaned));
  if (!raw) {
    return 0;
  }
  const queue = JSON.parse(raw) as FollowupQueueState;
  const cleared = queue.items.length + queue.droppedCount;
  await redis.del(getStateKey(cleaned));
  return cleared;
}
