import type {
  IdempotencyRecord,
  IdempotencyScope,
  IdempotencyStore,
} from "../../contracts/idempotency-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaIdempotencyStore implements IdempotencyStore {
  async reserve(scope: IdempotencyScope, ttlMs: number): Promise<"created" | "exists"> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: {
          tenantId_operation_requestKey: {
            tenantId: scope.tenantId,
            operation: scope.operation,
            requestKey: scope.key,
          },
        },
      });

      if (existing && existing.expiresAt.getTime() > Date.now()) {
        return "exists";
      }

      // Delete expired record if it exists
      if (existing) {
        await tx.idempotencyRecord.delete({ where: { id: existing.id } });
      }

      await tx.idempotencyRecord.create({
        data: {
          tenantId: scope.tenantId,
          agentId: scope.agentId,
          operation: scope.operation,
          requestKey: scope.key,
          status: "in_flight",
          expiresAt: new Date(Date.now() + ttlMs),
        },
      });
      return "created";
    });
  }

  async get(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const row = await tx.idempotencyRecord.findUnique({
        where: {
          tenantId_operation_requestKey: {
            tenantId: scope.tenantId,
            operation: scope.operation,
            requestKey: scope.key,
          },
        },
      });
      if (!row) return null;
      return {
        scope,
        createdAt: row.createdAt.getTime(),
        expiresAt: row.expiresAt.getTime(),
        status: row.status as IdempotencyRecord["status"],
        response: row.response ?? undefined,
        error: row.error as IdempotencyRecord["error"],
      };
    });
  }

  async complete(scope: IdempotencyScope, response?: unknown): Promise<void> {
    await withTenantScope(scope.tenantId, async (tx) => {
      await tx.idempotencyRecord.update({
        where: {
          tenantId_operation_requestKey: {
            tenantId: scope.tenantId,
            operation: scope.operation,
            requestKey: scope.key,
          },
        },
        data: {
          status: "completed",
          response: response as object | undefined,
        },
      });
    });
  }

  async fail(scope: IdempotencyScope, error: { code: string; message: string }): Promise<void> {
    await withTenantScope(scope.tenantId, async (tx) => {
      await tx.idempotencyRecord.update({
        where: {
          tenantId_operation_requestKey: {
            tenantId: scope.tenantId,
            operation: scope.operation,
            requestKey: scope.key,
          },
        },
        data: {
          status: "failed",
          error: error as object,
        },
      });
    });
  }

  async release(scope: IdempotencyScope): Promise<void> {
    await withTenantScope(scope.tenantId, async (tx) => {
      await tx.idempotencyRecord.deleteMany({
        where: {
          tenantId: scope.tenantId,
          operation: scope.operation,
          requestKey: scope.key,
        },
      });
    });
  }
}
