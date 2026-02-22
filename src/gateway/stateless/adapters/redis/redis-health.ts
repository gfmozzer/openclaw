import { getRedisClient } from "./redis-connection.js";

export type RedisHealthResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

/**
 * Pings the Redis server and returns latency + health status.
 * Safe to call even if Redis is not configured — returns ok:false with an error message.
 */
export async function checkRedisHealth(): Promise<RedisHealthResult> {
  const start = Date.now();
  try {
    const client = getRedisClient();
    // Explicit connect in case lazyConnect hasn't established the connection yet.
    if (client.status === "wait" || client.status === "close") {
      await client.connect();
    }
    await client.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}
