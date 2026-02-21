/**
 * Tenant-scoped Prisma client for enterprise multi-tenant PostgreSQL access.
 *
 * Uses `SET LOCAL app.tenant_id` inside interactive transactions so that
 * Row Level Security policies (created in migration 20260221205000) enforce
 * tenant isolation at the database level.
 */

import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient();
  }
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

/**
 * Execute `fn` inside a Prisma interactive transaction with `SET LOCAL app.tenant_id`.
 *
 * `SET LOCAL` scopes the variable to the current transaction only, so pooled
 * connections cannot leak tenant context across requests.
 */
export async function withTenantScope<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  const prisma = getPrismaClient();
  return prisma.$transaction(async (tx) => {
    // Use parameterized query to prevent SQL injection
    await (tx as unknown as PrismaClient).$executeRawUnsafe(
      `SET LOCAL app.tenant_id = $1`,
      tenantId,
    );
    return fn(tx);
  });
}

/**
 * Type alias for the transactional Prisma client passed to `withTenantScope` callbacks.
 */
export type TenantScopedTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
