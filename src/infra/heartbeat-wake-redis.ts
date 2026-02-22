/**
 * Redis Pub/Sub bridge for Heartbeat Wake.
 *
 * When a node calls `requestHeartbeatNow()`, the request is **also**
 * published to a Redis channel so that *all* nodes in the cluster can
 * react (e.g. a node that owns a specific WhatsApp account session can
 * wake its heartbeat even though the request originated elsewhere).
 *
 * Flow:
 *   requestHeartbeatNow() → local handler + publish to Redis channel
 *   Redis Pub/Sub → every node's subscriber → requestHeartbeatNow(local-only)
 *
 * Guard against echo: each node tags its publishes with a `nodeId` and
 * ignores messages it published itself.
 */
import { isRedisAvailable, getRedisClient } from "../gateway/stateless/adapters/redis/index.js";
import { requestHeartbeatNow } from "./heartbeat-wake.js";

const CHANNEL = "openclaw:heartbeat-wake";
const nodeId = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${Date.now()}`;

type HeartbeatWakeMessage = {
  nodeId: string;
  reason?: string;
  agentId?: string;
  sessionKey?: string;
  coalesceMs?: number;
};

let subscriberClient: ReturnType<typeof getRedisClient> | null = null;
let subscribed = false;

/**
 * Publish a heartbeat wake request to all nodes in the cluster.
 * The local node handles the request directly; remote nodes pick
 * it up through the Pub/Sub subscriber.
 */
export async function publishHeartbeatWake(opts?: {
  reason?: string;
  agentId?: string;
  sessionKey?: string;
  coalesceMs?: number;
}): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }
  try {
    const redis = getRedisClient();
    const msg: HeartbeatWakeMessage = {
      nodeId,
      reason: opts?.reason,
      agentId: opts?.agentId,
      sessionKey: opts?.sessionKey,
      coalesceMs: opts?.coalesceMs,
    };
    await redis.publish(CHANNEL, JSON.stringify(msg));
  } catch {
    // Best-effort; local handler already ran
  }
}

/**
 * Subscribe to heartbeat wake requests from other nodes.
 * Should be called once during gateway startup.
 */
export async function subscribeHeartbeatWake(): Promise<void> {
  if (!isRedisAvailable() || subscribed) {
    return;
  }
  try {
    // Pub/Sub requires a dedicated connection (subscriber mode blocks
    // the connection for regular commands).
    const redis = getRedisClient();
    subscriberClient = redis.duplicate();
    await subscriberClient.subscribe(CHANNEL);
    subscriberClient.on("message", (_channel: string, raw: string) => {
      try {
        const msg: HeartbeatWakeMessage = JSON.parse(raw);
        // Ignore our own publishes
        if (msg.nodeId === nodeId) {
          return;
        }
        requestHeartbeatNow({
          reason: msg.reason ?? "redis-pubsub",
          agentId: msg.agentId,
          sessionKey: msg.sessionKey,
          coalesceMs: msg.coalesceMs,
        });
      } catch {
        // Malformed message; ignore
      }
    });
    subscribed = true;
  } catch {
    // Redis unavailable; fall back to local-only
  }
}

/**
 * Unsubscribe and close the dedicated subscriber connection.
 * Called during graceful shutdown.
 */
export async function unsubscribeHeartbeatWake(): Promise<void> {
  if (!subscriberClient) {
    return;
  }
  try {
    await subscriberClient.unsubscribe(CHANNEL);
    subscriberClient.disconnect();
  } catch {
    // Best-effort cleanup
  } finally {
    subscriberClient = null;
    subscribed = false;
  }
}
