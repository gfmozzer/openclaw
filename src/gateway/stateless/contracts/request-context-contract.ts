import type { EnterpriseIdentity } from "./enterprise-orchestration.js";

export type RequestSource =
  | "channel_direct"
  | "trusted_frontdoor_api"
  | "internal_supervisor"
  | "system_job"
  | "operator_ui";

export type ChannelIdentity = {
  channelId: string;
  accountId: string;
  subjectId: string;
  sessionKey?: string;
  displayName?: string;
  threadId?: string;
};

export type EnterprisePrincipalRef = {
  tenantId: string;
  principalId: string;
  role: string;
  scopes: string[];
  attributes?: Record<string, unknown>;
};

export type OptimizationMode = "economy" | "balanced" | "quality" | "custom";
export type ContextPolicy = "lean" | "standard" | "full";

export type OptimizationPolicyHints = {
  optimizationMode?: OptimizationMode;
  contextPolicy?: ContextPolicy;
  routingHints?: {
    preferFast?: boolean;
    preferCheap?: boolean;
    allowEscalation?: boolean;
    escalationThreshold?: number;
  };
  budgetPolicyRef?: string;
  providerFeatureHints?: {
    preferPromptCaching?: boolean;
  };
};

export type TrustedFrontdoorDispatchContext = {
  frontdoorId: string;
  requestSource: "trusted_frontdoor_api";
  claims?: TrustedFrontdoorClaims;
  claimsRef?: string;
  trustedClaims?: Record<string, unknown>;
  businessContext?: Record<string, unknown>;
  requestedCapabilities?: Record<string, unknown>;
  requestedOptimization?: OptimizationPolicyHints;
  policyHints?: Record<string, unknown>;
};

export type TrustedFrontdoorClaims = {
  tenantId?: string;
  principalId?: string;
  scopes?: string[];
  requestId?: string;
  issuedAt?: number;
  expiresAt?: number;
  allowedOverrideFields?: string[];
  allowedCapabilities?: Record<string, unknown>;
  frontdoorId?: string;
  integrationId?: string;
};

export type RuntimeRequestContextEnvelope = {
  requestSource?: RequestSource;
  channelIdentity?: ChannelIdentity;
  enterprisePrincipal?: EnterprisePrincipalRef;
  trustedFrontdoor?: TrustedFrontdoorDispatchContext;
  optimization?: OptimizationPolicyHints;
};

export type GatewayClientLike = {
  connect?: {
    client?: { id?: string; displayName?: string };
    role?: string;
    device?: { id?: string };
    auth?: { token?: string; password?: string };
  };
};

export function normalizeRequestSource(value: unknown): RequestSource | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  switch (value) {
    case "channel_direct":
    case "trusted_frontdoor_api":
    case "internal_supervisor":
    case "system_job":
    case "operator_ui":
      return value;
    default:
      return undefined;
  }
}

export function sanitizeTrustedFrontdoorClaims(raw: unknown): TrustedFrontdoorClaims | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const trim = (v: unknown, max: number): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t.slice(0, max) : undefined;
  };
  const scopes = Array.isArray(input.scopes)
    ? input.scopes
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 256)
    : undefined;
  const allowedOverrideFields = Array.isArray(input.allowedOverrideFields)
    ? input.allowedOverrideFields
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 128)
    : undefined;
  const claims: TrustedFrontdoorClaims = {
    tenantId: trim(input.tenantId, 200),
    principalId: trim(input.principalId, 200),
    scopes,
    requestId: trim(input.requestId, 200),
    issuedAt: typeof input.issuedAt === "number" ? input.issuedAt : undefined,
    expiresAt: typeof input.expiresAt === "number" ? input.expiresAt : undefined,
    allowedOverrideFields,
    allowedCapabilities:
      input.allowedCapabilities && typeof input.allowedCapabilities === "object"
        ? (input.allowedCapabilities as Record<string, unknown>)
        : undefined,
    frontdoorId: trim(input.frontdoorId, 200),
    integrationId: trim(input.integrationId, 200),
  };
  return Object.values(claims).some((v) => v !== undefined) ? claims : undefined;
}

export function resolveDefaultRequestSource(params: {
  client: GatewayClientLike | null | undefined;
  method?: string;
}): RequestSource {
  const role = params.client?.connect?.role;
  if (role === "node") {
    return "internal_supervisor";
  }
  if (params.method === "chat.send" || params.method === "chat.inject") {
    return "operator_ui";
  }
  return "operator_ui";
}

export function mapEnterpriseIdentityToPrincipalRef(
  identity: EnterpriseIdentity | undefined,
): EnterprisePrincipalRef | undefined {
  if (!identity) {
    return undefined;
  }
  return {
    tenantId: identity.tenantId,
    principalId: identity.requesterId,
    role: identity.role,
    scopes: [...identity.scopes],
  };
}
