import { Redis } from "ioredis";

// BullMQ requires ioredis. This singleton is separate from the existing `redis` v4
// client used by RedisMessageBus / RedisIdempotencyStore (adapters/node/redis-shared.ts).
// Both clients can coexist; they connect to the same server but serve different consumers.

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_redis) {
    const url = process.env.OPENCLAW_REDIS_URL ?? "redis://localhost:6379";
    _redis = new Redis(url, {
      // BullMQ requirement: must be null to allow indefinite retries from workers.
      maxRetriesPerRequest: null,
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
