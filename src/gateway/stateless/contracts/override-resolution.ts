import type {
  ContextPolicy,
  OptimizationMode,
  OptimizationPolicyHints,
  RequestSource,
} from "./request-context-contract.js";

export type OverridePatch = {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  soul?: string;
  apiKey?: string;
  authProfileId?: string;
  skillAllowlist?: string[];
  optimizationMode?: OptimizationMode;
  contextPolicy?: ContextPolicy;
  routingHints?: OptimizationPolicyHints["routingHints"];
  budgetPolicyRef?: string;
};

export type OverrideFieldRejection = {
  field: keyof OverridePatch | string;
  reason: string;
};

export type CapabilityOverrideResolution = {
  requestedSkillAllowlist: string[] | null;
  policyAllowedSkills: string[] | null;
  agentDefaultSkillAllowlist: string[] | null;
  effectiveSkillAllowlist: string[] | null;
  rejectedSkills: Array<{ skillId: string; reason: string }>;
};

export type OptimizationOverrideResolution = {
  requestedOptimizationMode: OptimizationMode | null;
  effectiveOptimizationMode: OptimizationMode;
  effectiveContextPolicy: ContextPolicy;
  effectiveRoutingHints: OptimizationPolicyHints["routingHints"] | undefined;
  rejectedOptimizationFields: OverrideFieldRejection[];
  providerCapabilityAdjustments?: Array<{ field: string; adjustment: string }>;
};

export type OverrideResolution = {
  effectiveConfig: OverridePatch;
  effectiveSkillAllowlist: string[] | null;
  effectiveOptimizationPolicy?: OptimizationPolicyHints;
  appliedFields: string[];
  rejectedFields: OverrideFieldRejection[];
  origin: RequestSource | "unknown";
  capability: CapabilityOverrideResolution;
  optimization: OptimizationOverrideResolution;
};

type ResolveOverrideResolutionParams = {
  requestPatch?: OverridePatch;
  requestSource?: RequestSource;
  agentDefaults?: {
    skillAllowlist?: string[];
    optimizationMode?: OptimizationMode;
    contextPolicy?: ContextPolicy;
  };
  policy?: {
    allowedSkills?: string[];
  };
};

function normalizeString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, max);
}

function normalizeStringList(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    out.push(trimmed.slice(0, maxLen));
    if (out.length >= maxItems) {
      break;
    }
  }
  return out.length > 0 ? out : undefined;
}

function normalizeOptimizationMode(value: unknown): OptimizationMode | undefined {
  if (value === "economy" || value === "balanced" || value === "quality" || value === "custom") {
    return value;
  }
  return undefined;
}

function normalizeContextPolicy(value: unknown): ContextPolicy | undefined {
  if (value === "lean" || value === "standard" || value === "full") {
    return value;
  }
  return undefined;
}

export function sanitizeOverridePatch(raw: unknown): OverridePatch | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const patch: OverridePatch = {
    provider: normalizeString(input.provider, 200),
    model: normalizeString(input.model, 200),
    systemPrompt: normalizeString(input.systemPrompt, 12_000),
    soul: normalizeString(input.soul, 12_000),
    apiKey: normalizeString(input.apiKey, 8_192),
    authProfileId: normalizeString(input.authProfileId, 200),
    skillAllowlist: normalizeStringList(input.skillAllowlist, 128, 200),
    optimizationMode: normalizeOptimizationMode(input.optimizationMode),
    contextPolicy: normalizeContextPolicy(input.contextPolicy),
    routingHints:
      input.routingHints && typeof input.routingHints === "object"
        ? {
            preferFast:
              typeof (input.routingHints as Record<string, unknown>).preferFast === "boolean"
                ? ((input.routingHints as Record<string, unknown>).preferFast as boolean)
                : undefined,
            preferCheap:
              typeof (input.routingHints as Record<string, unknown>).preferCheap === "boolean"
                ? ((input.routingHints as Record<string, unknown>).preferCheap as boolean)
                : undefined,
            allowEscalation:
              typeof (input.routingHints as Record<string, unknown>).allowEscalation === "boolean"
                ? ((input.routingHints as Record<string, unknown>).allowEscalation as boolean)
                : undefined,
            escalationThreshold:
              typeof (input.routingHints as Record<string, unknown>).escalationThreshold === "number"
                ? ((input.routingHints as Record<string, unknown>).escalationThreshold as number)
                : undefined,
          }
        : undefined,
    budgetPolicyRef: normalizeString(input.budgetPolicyRef, 200),
  };
  return Object.values(patch).some((value) => value !== undefined) ? patch : undefined;
}

function intersectPreservingOrder(
  requested: string[] | undefined,
  defaults: string[] | undefined,
  allowed: string[] | undefined,
): CapabilityOverrideResolution {
  const rejectedSkills: Array<{ skillId: string; reason: string }> = [];
  const requestedSet = requested ? new Set(requested) : null;
  const defaultsSet = defaults ? new Set(defaults) : null;
  const allowedSet = allowed ? new Set(allowed) : null;

  const requestedSkillAllowlist = requested ? [...requested] : null;
  const agentDefaultSkillAllowlist = defaults ? [...defaults] : null;
  const policyAllowedSkills = allowed ? [...allowed] : null;

  let baseOrder: string[] = [];
  if (requested && requested.length > 0) {
    baseOrder = requested;
  } else if (defaults && defaults.length > 0) {
    baseOrder = defaults;
  } else if (allowed && allowed.length > 0) {
    baseOrder = allowed;
  }

  const effective: string[] = [];
  for (const skillId of baseOrder) {
    if (requestedSet && !requestedSet.has(skillId)) continue;
    if (defaultsSet && requestedSet && !defaultsSet.has(skillId)) {
      rejectedSkills.push({ skillId, reason: "not_in_agent_default_allowlist" });
      continue;
    }
    if (allowedSet && !allowedSet.has(skillId)) {
      rejectedSkills.push({ skillId, reason: "not_allowed_by_policy" });
      continue;
    }
    if (!effective.includes(skillId)) {
      effective.push(skillId);
    }
  }

  return {
    requestedSkillAllowlist,
    policyAllowedSkills,
    agentDefaultSkillAllowlist,
    effectiveSkillAllowlist: effective.length > 0 ? effective : null,
    rejectedSkills,
  };
}

export function resolveOverrideResolution(
  params: ResolveOverrideResolutionParams = {},
): OverrideResolution {
  const patch = params.requestPatch ?? {};
  const appliedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const rejectedFields: OverrideFieldRejection[] = [];

  const capability = intersectPreservingOrder(
    patch.skillAllowlist,
    params.agentDefaults?.skillAllowlist,
    params.policy?.allowedSkills,
  );

  const effectiveOptimizationMode =
    patch.optimizationMode ?? params.agentDefaults?.optimizationMode ?? "balanced";
  const effectiveContextPolicy = patch.contextPolicy ?? params.agentDefaults?.contextPolicy ?? "standard";

  const optimization: OptimizationOverrideResolution = {
    requestedOptimizationMode: patch.optimizationMode ?? null,
    effectiveOptimizationMode,
    effectiveContextPolicy,
    effectiveRoutingHints: patch.routingHints,
    rejectedOptimizationFields: [],
  };

  return {
    effectiveConfig: {
      ...patch,
      skillAllowlist: capability.effectiveSkillAllowlist ?? undefined,
      optimizationMode: effectiveOptimizationMode,
      contextPolicy: effectiveContextPolicy,
    },
    effectiveSkillAllowlist: capability.effectiveSkillAllowlist,
    effectiveOptimizationPolicy: {
      optimizationMode: effectiveOptimizationMode,
      contextPolicy: effectiveContextPolicy,
      routingHints: patch.routingHints,
      budgetPolicyRef: patch.budgetPolicyRef,
    },
    appliedFields,
    rejectedFields,
    origin: params.requestSource ?? "unknown",
    capability,
    optimization,
  };
}

