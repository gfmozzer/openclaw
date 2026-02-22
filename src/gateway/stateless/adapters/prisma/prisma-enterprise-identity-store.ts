import type {
  ChannelIdentityBindingDef,
  EnterpriseGrantDef,
  EnterpriseIdentityStore,
  EnterprisePrincipalDef,
} from "../../contracts/enterprise-identity-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaEnterpriseIdentityStore implements EnterpriseIdentityStore {
  async upsertPrincipal(
    tenantId: string,
    principalId: string,
    role: string,
    attributes?: Record<string, unknown>,
  ): Promise<EnterprisePrincipalDef> {
    return withTenantScope(tenantId, async (tx) => {
      const p = await tx.enterprisePrincipal.upsert({
        where: { tenantId_principalId: { tenantId, principalId } },
        update: {
          role,
          attributes: attributes ? (attributes as any) : undefined,
        },
        create: {
          tenantId,
          principalId,
          role,
          attributes: attributes ? (attributes as any) : undefined,
        },
      });
      return {
        ...p,
        attributes: (p.attributes as Record<string, unknown>) ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async getPrincipal(tenantId: string, principalId: string): Promise<EnterprisePrincipalDef | null> {
    return withTenantScope(tenantId, async (tx) => {
      const p = await tx.enterprisePrincipal.findUnique({
        where: { tenantId_principalId: { tenantId, principalId } },
      });
      if (!p) return null;
      return {
        ...p,
        attributes: (p.attributes as Record<string, unknown>) ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async listPrincipals(
    tenantId: string,
    limit = 100,
    cursor?: string,
  ): Promise<{ items: EnterprisePrincipalDef[]; nextCursor?: string }> {
    return withTenantScope(tenantId, async (tx) => {
      const items = await tx.enterprisePrincipal.findMany({
        where: { tenantId },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: items.map((p) => ({
          ...p,
          attributes: (p.attributes as Record<string, unknown>) ?? undefined,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        nextCursor,
      };
    });
  }

  async bindChannel(
    tenantId: string,
    principalId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<ChannelIdentityBindingDef> {
    return withTenantScope(tenantId, async (tx) => {
      const b = await tx.channelIdentityBinding.upsert({
        where: {
          tenantId_channelId_accountId_subjectId: {
            tenantId,
            channelId,
            accountId,
            subjectId,
          },
        },
        update: {
          principalId,
          status: "active",
        },
        create: {
          tenantId,
          channelId,
          accountId,
          subjectId,
          principalId,
        },
      });
      return {
        ...b,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      };
    });
  }

  async unbindChannel(
    tenantId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<boolean> {
    return withTenantScope(tenantId, async (tx) => {
      try {
        await tx.channelIdentityBinding.delete({
          where: {
            tenantId_channelId_accountId_subjectId: {
              tenantId,
              channelId,
              accountId,
              subjectId,
            },
          },
        });
        return true;
      } catch (err: any) {
        // P2025: Record to delete does not exist.
        if (err.code === "P2025") return false;
        throw err;
      }
    });
  }

  async getPrincipalByChannel(
    tenantId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<EnterprisePrincipalDef | null> {
    return withTenantScope(tenantId, async (tx) => {
      const binding = await tx.channelIdentityBinding.findUnique({
        where: {
          tenantId_channelId_accountId_subjectId: {
            tenantId,
            channelId,
            accountId,
            subjectId,
          },
        },
        include: {
          principal: true,
        },
      });

      if (!binding || !binding.principal || binding.status !== "active" || binding.principal.status !== "active") {
        return null;
      }

      const p = binding.principal;
      return {
        ...p,
        attributes: (p.attributes as Record<string, unknown>) ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async listChannelBindings(
    tenantId: string,
    principalId?: string,
  ): Promise<ChannelIdentityBindingDef[]> {
    return withTenantScope(tenantId, async (tx) => {
      const items = await tx.channelIdentityBinding.findMany({
        where: {
          tenantId,
          ...(principalId ? { principalId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return items.map((b) => ({
        ...b,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }));
    });
  }

  async upsertGrant(
    tenantId: string,
    principalId: string,
    resource: string,
    action: string,
    attributes?: Record<string, unknown>,
  ): Promise<EnterpriseGrantDef> {
    return withTenantScope(tenantId, async (tx) => {
      const g = await tx.enterpriseGrant.upsert({
        where: {
          tenantId_principalId_resource_action: {
            tenantId,
            principalId,
            resource,
            action,
          },
        },
        update: {
          attributes: attributes ? (attributes as any) : undefined,
        },
        create: {
          tenantId,
          principalId,
          resource,
          action,
          attributes: attributes ? (attributes as any) : undefined,
        },
      });
      return {
        ...g,
        attributes: (g.attributes as Record<string, unknown>) ?? undefined,
        createdAt: g.createdAt.toISOString(),
      };
    });
  }

  async revokeGrant(tenantId: string, principalId: string, resource: string, action: string): Promise<boolean> {
    return withTenantScope(tenantId, async (tx) => {
      try {
        await tx.enterpriseGrant.delete({
          where: {
            tenantId_principalId_resource_action: {
              tenantId,
              principalId,
              resource,
              action,
            },
          },
        });
        return true;
      } catch (err: any) {
        if (err.code === "P2025") return false;
        throw err;
      }
    });
  }

  async listGrants(tenantId: string, principalId: string): Promise<EnterpriseGrantDef[]> {
    return withTenantScope(tenantId, async (tx) => {
      const items = await tx.enterpriseGrant.findMany({
        where: { tenantId, principalId },
      });
      return items.map((g) => ({
        ...g,
        attributes: (g.attributes as Record<string, unknown>) ?? undefined,
        createdAt: g.createdAt.toISOString(),
      }));
    });
  }
}
