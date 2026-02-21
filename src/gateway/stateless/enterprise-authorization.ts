import type {
  EnterpriseError,
  EnterpriseErrorCode,
  EnterpriseIdentity,
  EnterpriseScope,
} from "./contracts/enterprise-orchestration.js";

export type EnterpriseAuthorizationResult =
  | { ok: true }
  | {
      ok: false;
      error: EnterpriseError;
    };

function error(code: EnterpriseErrorCode, message: string, details?: Record<string, unknown>): EnterpriseError {
  return { code, message, details };
}

export function authorizeEnterpriseScope(params: {
  identity: EnterpriseIdentity | null | undefined;
  requiredScope: EnterpriseScope;
  tenantId: string;
}): EnterpriseAuthorizationResult {
  const identity = params.identity;
  if (!identity) {
    return {
      ok: false,
      error: error("UNAUTHORIZED_REQUESTER", "missing requester identity"),
    };
  }
  if (identity.tenantId !== params.tenantId) {
    return {
      ok: false,
      error: error("CROSS_TENANT_FORBIDDEN", "requester cannot access another tenant", {
        requesterTenantId: identity.tenantId,
        targetTenantId: params.tenantId,
      }),
    };
  }
  if (!identity.scopes.includes(params.requiredScope)) {
    return {
      ok: false,
      error: error("FORBIDDEN_SCOPE", "missing required scope", {
        requiredScope: params.requiredScope,
      }),
    };
  }
  return { ok: true };
}

