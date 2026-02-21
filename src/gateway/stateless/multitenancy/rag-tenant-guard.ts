import { normalizeTenantId } from "./tenant-context.js";

export type RagTenantFilter = {
  tenant_id: string;
};

export function buildRagTenantFilter(tenantId: string): RagTenantFilter {
  return { tenant_id: normalizeTenantId(tenantId) };
}

export function assertRagTenantAccess(params: {
  requestedTenantId: string;
  resourceTenantId: string;
}): void {
  const requested = normalizeTenantId(params.requestedTenantId);
  const resource = normalizeTenantId(params.resourceTenantId);
  if (requested !== resource) {
    throw new Error(
      `cross-tenant access denied: requested=${requested} resource=${resource}`,
    );
  }
}

export function withTenantWhereClause<T extends Record<string, unknown>>(params: {
  tenantId: string;
  where?: T;
}): T & RagTenantFilter {
  const tenant_id = normalizeTenantId(params.tenantId);
  const base = (params.where ?? {}) as T & Partial<RagTenantFilter>;
  if (base.tenant_id && normalizeTenantId(String(base.tenant_id)) !== tenant_id) {
    throw new Error("conflicting tenant_id in where clause");
  }
  return {
    ...base,
    tenant_id,
  } as T & RagTenantFilter;
}

