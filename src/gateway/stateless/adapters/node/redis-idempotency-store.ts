import type {
  IdempotencyRecord,
  IdempotencyScope,
  IdempotencyStore,
} from "../../contracts/idempotency-store.js";
import { incrementEnterpriseMetric } from "../../../runtime-metrics.js";
import type { RedisRuntimeConfig } from "./redis-shared.js";
import { RedisClientFactory } from "./redis-shared.js";

function scopeKey(prefix: string, scope: IdempotencyScope): string {
  return `${prefix}:idem:${scope.tenantId}:${scope.agentId}:${scope.operation}:${scope.key}`;
}

function parseRecord(raw: unknown): IdempotencyRecord | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as IdempotencyRecord;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly clients: RedisClientFactory;

  constructor(private readonly config: RedisRuntimeConfig) {
    this.clients = new RedisClientFactory(config);
  }

  async reserve(scope: IdempotencyScope, ttlMs: number): Promise<"created" | "exists"> {
    try {
      const key = scopeKey(this.config.prefix, scope);
      const now = Date.now();
      const payload: IdempotencyRecord = {
        scope,
        createdAt: now,
        expiresAt: now + Math.max(1, ttlMs),
        status: "in_flight",
      };
      const redis = await this.clients.getCommandClient();
      const result = await redis.sendCommand([
        "SET",
        key,
        JSON.stringify(payload),
        "NX",
        "PX",
        String(Math.max(1, ttlMs)),
      ]);
      return result === "OK" ? "created" : "exists";
    } catch (_err) {
      incrementEnterpriseMetric("idempotency_lock_failures_total");
      throw _err;
    }
  }

  async get(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    try {
      const redis = await this.clients.getCommandClient();
      const key = scopeKey(this.config.prefix, scope);
      const raw = await redis.sendCommand(["GET", key]);
      return parseRecord(raw);
    } catch (_err) {
      incrementEnterpriseMetric("idempotency_lock_failures_total");
      throw _err;
    }
  }

  async complete(scope: IdempotencyScope, response?: unknown): Promise<void> {
    await this.update(scope, (current) => ({ ...current, status: "completed", response }));
  }

  async fail(scope: IdempotencyScope, error: { code: string; message: string }): Promise<void> {
    await this.update(scope, (current) => ({ ...current, status: "failed", error }));
  }

  async release(scope: IdempotencyScope): Promise<void> {
    try {
      const redis = await this.clients.getCommandClient();
      await redis.sendCommand(["DEL", scopeKey(this.config.prefix, scope)]);
    } catch (_err) {
      incrementEnterpriseMetric("idempotency_lock_failures_total");
      throw _err;
    }
  }

  private async update(
    scope: IdempotencyScope,
    updater: (current: IdempotencyRecord) => IdempotencyRecord,
  ): Promise<void> {
    try {
      const redis = await this.clients.getCommandClient();
      const key = scopeKey(this.config.prefix, scope);
      const current = parseRecord(await redis.sendCommand(["GET", key]));
      if (!current) {
        return;
      }
      const remainingMs = Math.max(1, current.expiresAt - Date.now());
      const next = updater(current);
      await redis.sendCommand(["SET", key, JSON.stringify(next), "XX", "PX", String(remainingMs)]);
    } catch (_err) {
      incrementEnterpriseMetric("idempotency_lock_failures_total");
      throw _err;
    }
  }
}
