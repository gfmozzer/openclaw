export type TenantId = string;

export type TenantPrincipal = {
  tenantId: TenantId;
  userId?: string;
  phoneNumber?: string;
  channel?: string;
  accountId?: string;
};

export type TenantContext = {
  tenantId: TenantId;
  principal: TenantPrincipal;
  trace?: {
    requestId?: string;
    runId?: string;
  };
};

function normalizeToken(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function normalizeTenantId(value: string): TenantId {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (!normalized) {
    throw new Error("tenant_id is required");
  }
  return normalized;
}

export function buildTenantContext(params: {
  tenantId: string;
  userId?: string;
  phoneNumber?: string;
  channel?: string;
  accountId?: string;
  requestId?: string;
  runId?: string;
}): TenantContext {
  return {
    tenantId: normalizeTenantId(params.tenantId),
    principal: {
      tenantId: normalizeTenantId(params.tenantId),
      userId: normalizeToken(params.userId),
      phoneNumber: normalizeToken(params.phoneNumber),
      channel: normalizeToken(params.channel),
      accountId: normalizeToken(params.accountId),
    },
    trace: {
      requestId: params.requestId,
      runId: params.runId,
    },
  };
}

