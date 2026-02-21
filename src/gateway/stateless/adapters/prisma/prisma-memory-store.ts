import type {
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
} from "../../contracts/memory-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaMemoryStore implements MemoryStore {
  async append(entry: MemoryEntry): Promise<void> {
    await withTenantScope(entry.scope.tenantId, async (tx) => {
      await tx.memoryInteraction.create({
        data: {
          id: entry.id,
          tenantId: entry.scope.tenantId,
          sessionId: entry.scope.sessionKey,
          role: entry.role,
          content: entry.content as object,
          createdAt: new Date(entry.timestamp),
        },
      });
    });
  }

  async appendMany(entries: MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const tenantId = entries[0].scope.tenantId;
    await withTenantScope(tenantId, async (tx) => {
      await tx.memoryInteraction.createMany({
        data: entries.map((e) => ({
          id: e.id,
          tenantId: e.scope.tenantId,
          sessionId: e.scope.sessionKey,
          role: e.role,
          content: e.content as object,
          createdAt: new Date(e.timestamp),
        })),
      });
    });
  }

  async list(scope: MemoryScope, query?: MemoryQuery): Promise<MemoryEntry[]> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const rows = await tx.memoryInteraction.findMany({
        where: {
          tenantId: scope.tenantId,
          sessionId: scope.sessionKey,
          ...(query?.after ? { createdAt: { gt: new Date(query.after) } } : {}),
          ...(query?.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: query?.limit ?? 200,
      });
      return rows.map((row) => ({
        id: row.id,
        scope,
        role: row.role as MemoryEntry["role"],
        content: row.content,
        timestamp: row.createdAt.getTime(),
      }));
    });
  }

  async compact(scope: MemoryScope, opts: { keepLast: number }): Promise<number> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const total = await tx.memoryInteraction.count({
        where: { tenantId: scope.tenantId, sessionId: scope.sessionKey },
      });
      const toDelete = total - opts.keepLast;
      if (toDelete <= 0) return 0;

      const oldest = await tx.memoryInteraction.findMany({
        where: { tenantId: scope.tenantId, sessionId: scope.sessionKey },
        orderBy: { createdAt: "asc" },
        take: toDelete,
        select: { id: true },
      });

      const result = await tx.memoryInteraction.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
      return result.count;
    });
  }

  async deleteScope(scope: MemoryScope): Promise<number> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const result = await tx.memoryInteraction.deleteMany({
        where: { tenantId: scope.tenantId, sessionId: scope.sessionKey },
      });
      return result.count;
    });
  }
}
