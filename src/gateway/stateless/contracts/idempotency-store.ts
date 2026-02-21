export type IdempotencyScope = {
  tenantId: string;
  agentId: string;
  operation: string;
  key: string;
};

export type IdempotencyRecord = {
  scope: IdempotencyScope;
  createdAt: number;
  expiresAt: number;
  status: "in_flight" | "completed" | "failed";
  response?: unknown;
  error?: { code: string; message: string };
};

export interface IdempotencyStore {
  reserve(scope: IdempotencyScope, ttlMs: number): Promise<"created" | "exists">;
  get(scope: IdempotencyScope): Promise<IdempotencyRecord | null>;
  complete(scope: IdempotencyScope, response?: unknown): Promise<void>;
  fail(scope: IdempotencyScope, error: { code: string; message: string }): Promise<void>;
  release(scope: IdempotencyScope): Promise<void>;
}

