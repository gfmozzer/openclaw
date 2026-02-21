import type {
  AuditEventEntry,
  AuditEventQuery,
  AuditEventStore,
} from "../../contracts/audit-event-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaAuditEventStore implements AuditEventStore {
  async append(event: AuditEventEntry): Promise<void> {
    await withTenantScope(event.tenantId, async (tx) => {
      await tx.auditEvent.create({
        data: {
          tenantId: event.tenantId,
          requesterId: event.requesterId ?? null,
          action: event.action,
          resource: event.resource ?? null,
          metadata: (event.metadata as object) ?? undefined,
        },
      });
    });
  }

  async list(query: AuditEventQuery): Promise<AuditEventEntry[]> {
    return withTenantScope(query.tenantId, async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where: {
          tenantId: query.tenantId,
          ...(query.action ? { action: query.action } : {}),
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: query.limit ?? 100,
      });
      return rows.map((row) => ({
        tenantId: row.tenantId,
        requesterId: row.requesterId ?? undefined,
        action: row.action,
        resource: row.resource ?? undefined,
        metadata: (row.metadata as Record<string, unknown>) ?? undefined,
      }));
    });
  }
}
