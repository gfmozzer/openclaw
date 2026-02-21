import type {
  IdempotencyRecord,
  IdempotencyScope,
  IdempotencyStore,
} from "../../contracts/idempotency-store.js";

function scopeKey(scope: IdempotencyScope): string {
  return `${scope.tenantId}:${scope.agentId}:${scope.operation}:${scope.key}`;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  private pruneExpired(now = Date.now()): void {
    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }

  async reserve(scope: IdempotencyScope, ttlMs: number): Promise<"created" | "exists"> {
    this.pruneExpired();
    const key = scopeKey(scope);
    if (this.records.has(key)) {
      return "exists";
    }
    const now = Date.now();
    this.records.set(key, {
      scope,
      createdAt: now,
      expiresAt: now + Math.max(1, ttlMs),
      status: "in_flight",
    });
    return "created";
  }

  async get(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    this.pruneExpired();
    return this.records.get(scopeKey(scope)) ?? null;
  }

  async complete(scope: IdempotencyScope, response?: unknown): Promise<void> {
    const key = scopeKey(scope);
    const current = this.records.get(key);
    if (!current) {
      return;
    }
    this.records.set(key, { ...current, status: "completed", response });
  }

  async fail(scope: IdempotencyScope, error: { code: string; message: string }): Promise<void> {
    const key = scopeKey(scope);
    const current = this.records.get(key);
    if (!current) {
      return;
    }
    this.records.set(key, { ...current, status: "failed", error });
  }

  async release(scope: IdempotencyScope): Promise<void> {
    this.records.delete(scopeKey(scope));
  }
}

