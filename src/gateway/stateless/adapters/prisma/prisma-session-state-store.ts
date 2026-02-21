import type {
  SessionPatch,
  SessionScope,
  SessionState,
  SessionStateStore,
} from "../../contracts/session-state-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaSessionStateStore implements SessionStateStore {
  async get(scope: SessionScope): Promise<SessionState | null> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const row = await tx.session.findFirst({
        where: { tenantId: scope.tenantId, id: scope.sessionKey },
      });
      if (!row) return null;
      const meta = row.title ? { title: row.title } : undefined;
      return {
        scope,
        sessionId: row.id,
        updatedAt: row.updatedAt.getTime(),
        metadata: meta,
      };
    });
  }

  async upsert(state: SessionState): Promise<void> {
    await withTenantScope(state.scope.tenantId, async (tx) => {
      await tx.session.upsert({
        where: { id: state.sessionId },
        create: {
          id: state.sessionId,
          tenantId: state.scope.tenantId,
          requesterId: state.scope.agentId,
          title: state.metadata?.title as string | undefined,
        },
        update: {
          title: state.metadata?.title as string | undefined,
          updatedAt: new Date(),
        },
      });
    });
  }

  async patch(scope: SessionScope, patch: SessionPatch): Promise<SessionState | null> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const existing = await tx.session.findFirst({
        where: { tenantId: scope.tenantId, id: scope.sessionKey },
      });
      if (!existing) return null;
      const updated = await tx.session.update({
        where: { id: existing.id },
        data: {
          title: (patch.metadata?.title as string | undefined) ?? existing.title,
          updatedAt: new Date(),
        },
      });
      return {
        scope,
        sessionId: updated.id,
        updatedAt: updated.updatedAt.getTime(),
        route: patch.route,
        metadata: patch.metadata,
      };
    });
  }

  async delete(scope: SessionScope): Promise<boolean> {
    return withTenantScope(scope.tenantId, async (tx) => {
      const existing = await tx.session.findFirst({
        where: { tenantId: scope.tenantId, id: scope.sessionKey },
      });
      if (!existing) return false;
      await tx.session.delete({ where: { id: existing.id } });
      return true;
    });
  }

  async listByTenant(
    tenantId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<SessionState[]> {
    return withTenantScope(tenantId, async (tx) => {
      const rows = await tx.session.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: opts?.limit ?? 100,
        ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      });
      return rows.map((row) => ({
        scope: { tenantId, agentId: row.requesterId, sessionKey: row.id },
        sessionId: row.id,
        updatedAt: row.updatedAt.getTime(),
        metadata: row.title ? { title: row.title } : undefined,
      }));
    });
  }
}
