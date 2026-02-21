import { buildTenantContext, normalizeTenantId, type TenantContext } from "./tenant-context.js";

export type TenantIdentifierInput = {
  userId?: string;
  phoneNumber?: string;
  channel?: string;
  accountId?: string;
  fallbackTenantId?: string;
  requestId?: string;
  runId?: string;
};

export type TenantResolver = {
  resolve: (input: TenantIdentifierInput) => TenantContext;
};

function normalizePhone(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(/[^\d+]/g, "");
  return normalized || undefined;
}

function normalizeUserId(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function deriveTenantId(input: TenantIdentifierInput): string {
  const phone = normalizePhone(input.phoneNumber);
  if (phone) {
    return `phone:${phone}`;
  }
  const userId = normalizeUserId(input.userId);
  if (userId) {
    return `user:${userId}`;
  }
  if (input.fallbackTenantId?.trim()) {
    return normalizeTenantId(input.fallbackTenantId);
  }
  throw new Error("unable to derive tenant_id: missing phone_number or user_id");
}

export function createTenantResolver(): TenantResolver {
  return {
    resolve: (input) => {
      const tenantId = deriveTenantId(input);
      return buildTenantContext({
        tenantId,
        userId: normalizeUserId(input.userId),
        phoneNumber: normalizePhone(input.phoneNumber),
        channel: input.channel,
        accountId: input.accountId,
        requestId: input.requestId,
        runId: input.runId,
      });
    },
  };
}

