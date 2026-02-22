/**
 * providers-service.ts
 *
 * Serviço de providers para os RPCs de providers.registry.list,
 * providers.credentials.* e providers.models.list.
 *
 * Regras:
 * - Nunca retornar segredo em payload de resposta.
 * - Leitura de credenciais: auth profiles (canônico) + config inline (legado, read-only).
 * - Escrita de credenciais: somente auth profiles.
 */

import { loadConfig } from "../config/config.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import {
  ensureAuthProfileStore,
  listProfilesForProvider,
  upsertAuthProfileWithLock,
  type AuthProfileCredential,
  type AuthProfileStore,
} from "../agents/auth-profiles.js";
import { updateAuthProfileStoreWithLock } from "../agents/auth-profiles/store.js";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderCredentialType = "api_key" | "token" | "oauth";

export type ProviderCredentialMeta = {
  profileId: string;
  providerId: string;
  credentialType: ProviderCredentialType;
  hasCredential: boolean;
  lastUpdatedAt?: number;
};

export type ProviderSource = "plugin" | "builtin" | "custom";

export type ProviderRegistryEntry = {
  id: string;
  label: string;
  sources: ProviderSource[];
  hasCredential: boolean;
  credentialType?: ProviderCredentialType;
  modelCount: number;
  supportsCredentialTest: boolean;
  supportsLiveModelDiscovery: boolean;
};

// ---------------------------------------------------------------------------
// Static built-in provider metadata
// ---------------------------------------------------------------------------

type BuiltinProviderMeta = {
  label: string;
  defaultCredentialType: ProviderCredentialType;
  supportsCredentialTest: boolean;
  supportsLiveModelDiscovery: boolean;
};

const BUILTIN_PROVIDER_META: Record<string, BuiltinProviderMeta> = {
  anthropic: {
    label: "Anthropic",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: false,
  },
  openai: {
    label: "OpenAI",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: true,
  },
  "azure-openai": {
    label: "Azure OpenAI",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: false,
  },
  fal: {
    label: "Fal.ai",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: false,
  },
  google: {
    label: "Google (Gemini)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: false,
  },
  cohere: {
    label: "Cohere",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  mistral: {
    label: "Mistral",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: true,
  },
  groq: {
    label: "Groq",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: true,
  },
  ollama: {
    label: "Ollama (Local)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: true,
    supportsLiveModelDiscovery: true,
  },
  vllm: {
    label: "vLLM (Local)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: true,
  },
  "amazon-bedrock": {
    label: "Amazon Bedrock",
    defaultCredentialType: "token",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: true,
  },
  "github-copilot": {
    label: "GitHub Copilot",
    defaultCredentialType: "oauth",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  minimax: {
    label: "MiniMax",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  "minimax-portal": {
    label: "MiniMax (Portal OAuth)",
    defaultCredentialType: "oauth",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  moonshot: {
    label: "Moonshot (Kimi)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  "kimi-coding": {
    label: "Kimi for Coding",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  venice: {
    label: "Venice",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: true,
  },
  "qwen-portal": {
    label: "Qwen (Portal OAuth)",
    defaultCredentialType: "oauth",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  volcengine: {
    label: "Volcengine (Doubao)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  "volcengine-plan": {
    label: "Volcengine Plan",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  byteplus: {
    label: "BytePlus",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  "byteplus-plan": {
    label: "BytePlus Plan",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  xiaomi: {
    label: "Xiaomi (MiMo)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  "cloudflare-ai-gateway": {
    label: "Cloudflare AI Gateway",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  together: {
    label: "Together AI",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  huggingface: {
    label: "Hugging Face",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: true,
  },
  nvidia: {
    label: "NVIDIA",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  qianfan: {
    label: "Qianfan (Baidu)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
  synthetic: {
    label: "Synthetic (Test)",
    defaultCredentialType: "api_key",
    supportsCredentialTest: false,
    supportsLiveModelDiscovery: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAgentDir(): string {
  const cfg = loadConfig();
  const defaultId = resolveDefaultAgentId(cfg);
  return resolveAgentWorkspaceDir(cfg, defaultId);
}

function resolveCredentialTypeFromCredential(
  cred: AuthProfileCredential,
): ProviderCredentialType {
  if (cred.type === "oauth") return "oauth";
  if (cred.type === "token") return "token";
  return "api_key";
}

function hasActualSecret(cred: AuthProfileCredential): boolean {
  if (cred.type === "api_key") {
    return typeof cred.key === "string" && cred.key.trim().length > 0;
  }
  if (cred.type === "token") {
    return typeof cred.token === "string" && cred.token.trim().length > 0;
  }
  if (cred.type === "oauth") {
    return (
      (typeof cred.access === "string" && cred.access.trim().length > 0) ||
      (typeof cred.refresh === "string" && cred.refresh.trim().length > 0)
    );
  }
  return false;
}

function resolveHasCredentialForProvider(
  providerId: string,
  store: AuthProfileStore,
): { hasCredential: boolean; credentialType?: ProviderCredentialType } {
  // Check auth profiles first (canonical source).
  const profileIds = listProfilesForProvider(store, providerId);
  for (const profileId of profileIds) {
    const cred = store.profiles[profileId];
    if (cred && hasActualSecret(cred)) {
      return {
        hasCredential: true,
        credentialType: resolveCredentialTypeFromCredential(cred),
      };
    }
  }
  // Fallback: check environment variable.
  const envKey = resolveEnvApiKey(providerId);
  if (envKey) {
    return { hasCredential: true, credentialType: "api_key" };
  }
  // Legacy fallback: inline config models.providers.<provider>.apiKey
  const cfg = loadConfig();
  const legacyProvider = cfg.models?.providers?.[providerId];
  const inlineApiKey =
    legacyProvider && typeof legacyProvider === "object" && "apiKey" in legacyProvider
      ? typeof (legacyProvider as { apiKey?: unknown }).apiKey === "string"
        ? (legacyProvider as { apiKey?: string }).apiKey?.trim()
        : ""
      : "";
  if (inlineApiKey) {
    return { hasCredential: true, credentialType: "api_key" };
  }
  return { hasCredential: false };
}

// ---------------------------------------------------------------------------
// providers.registry.list
// ---------------------------------------------------------------------------

export function buildProviderRegistryList(
  modelCatalog: ModelCatalogEntry[],
): ProviderRegistryEntry[] {
  const agentDir = resolveAgentDir();
  const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });

  // Count models per provider from the live catalog.
  const modelCountByProvider = new Map<string, number>();
  for (const entry of modelCatalog) {
    const count = modelCountByProvider.get(entry.provider) ?? 0;
    modelCountByProvider.set(entry.provider, count + 1);
  }

  // Collect all provider IDs: built-in + discovered from model catalog.
  const allProviderIds = new Set([
    ...Object.keys(BUILTIN_PROVIDER_META),
    ...modelCountByProvider.keys(),
  ]);

  // Also include providers from auth store that aren't already listed.
  for (const cred of Object.values(store.profiles)) {
    if (cred.provider) {
      allProviderIds.add(cred.provider);
    }
  }

  // Also include config-defined custom providers.
  const cfg = loadConfig();
  const configProviders = cfg.models?.providers ?? {};
  for (const key of Object.keys(configProviders)) {
    allProviderIds.add(key);
  }

  const entries: ProviderRegistryEntry[] = [];

  for (const id of allProviderIds) {
    const builtin = BUILTIN_PROVIDER_META[id];
    const isBuiltin = !!builtin;
    const isCustomConfig = !!configProviders[id];

    const sources: ProviderSource[] = [];
    if (isBuiltin) sources.push("builtin");
    if (isCustomConfig) sources.push("custom");
    if (sources.length === 0) sources.push("plugin");

    const { hasCredential, credentialType: detectedCredentialType } =
      resolveHasCredentialForProvider(id, store);

    const credentialType =
      detectedCredentialType ?? builtin?.defaultCredentialType ?? "api_key";

    entries.push({
      id,
      label: builtin?.label ?? id,
      sources,
      hasCredential,
      credentialType: hasCredential ? credentialType : undefined,
      modelCount: modelCountByProvider.get(id) ?? 0,
      supportsCredentialTest: builtin?.supportsCredentialTest ?? false,
      supportsLiveModelDiscovery: builtin?.supportsLiveModelDiscovery ?? false,
    });
  }

  // Sort: built-ins first (alphabetically), then custom, then plugins.
  entries.sort((a, b) => {
    const aBuiltin = a.sources.includes("builtin") ? 0 : 1;
    const bBuiltin = b.sources.includes("builtin") ? 0 : 1;
    if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
    return a.id.localeCompare(b.id);
  });

  return entries;
}

// ---------------------------------------------------------------------------
// providers.credentials.list
// ---------------------------------------------------------------------------

export function listProviderCredentials(
  filterProviderId?: string,
): ProviderCredentialMeta[] {
  const agentDir = resolveAgentDir();
  const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });

  const results: ProviderCredentialMeta[] = [];

  for (const [profileId, cred] of Object.entries(store.profiles)) {
    if (!cred.provider) continue;
    if (filterProviderId && cred.provider !== filterProviderId) continue;

    results.push({
      profileId,
      providerId: cred.provider,
      credentialType: resolveCredentialTypeFromCredential(cred),
      hasCredential: hasActualSecret(cred),
    });
  }

  results.sort((a, b) => a.providerId.localeCompare(b.providerId));
  return results;
}

// ---------------------------------------------------------------------------
// providers.credentials.upsert
// ---------------------------------------------------------------------------

export type UpsertProviderCredentialParams = {
  providerId: string;
  credentialType: ProviderCredentialType;
  key?: string;
  token?: string;
  email?: string;
};

export type UpsertProviderCredentialResult = {
  profileId: string;
  providerId: string;
};

export async function upsertProviderCredential(
  params: UpsertProviderCredentialParams,
): Promise<UpsertProviderCredentialResult> {
  const agentDir = resolveAgentDir();
  const profileId = `${params.providerId}:default`;

  let credential: AuthProfileCredential;

  if (params.credentialType === "api_key") {
    credential = {
      type: "api_key",
      provider: params.providerId,
      key: params.key ?? "",
      email: params.email,
    };
  } else if (params.credentialType === "token") {
    credential = {
      type: "token",
      provider: params.providerId,
      token: params.token ?? "",
      email: params.email,
    };
  } else {
    // oauth: not fully supported via RPC yet — store a placeholder
    credential = {
      type: "oauth",
      provider: params.providerId,
      email: params.email,
    } as AuthProfileCredential;
  }

  await upsertAuthProfileWithLock({ profileId, credential, agentDir });

  return { profileId, providerId: params.providerId };
}

// ---------------------------------------------------------------------------
// providers.credentials.delete
// ---------------------------------------------------------------------------

export async function deleteProviderCredential(
  profileId: string,
): Promise<{ profileId: string }> {
  const agentDir = resolveAgentDir();

  await updateAuthProfileStoreWithLock({
    agentDir,
    updater: (store: AuthProfileStore) => {
      if (!store.profiles[profileId]) {
        return false;
      }
      delete store.profiles[profileId];
      return true;
    },
  });

  return { profileId };
}

// ---------------------------------------------------------------------------
// providers.models.list (TTL cache + invalidation)
// ---------------------------------------------------------------------------

type ProviderModelGroup = {
  providerId: string;
  models: Array<{
    id: string;
    name: string;
    source: ProviderSource;
    driverId?: string;
    modelRoute?: string;
    toolMode?: boolean;
    toolContract?: Record<string, unknown>;
    contextWindow?: number;
    reasoning?: boolean;
    input?: Array<"text" | "image">;
  }>;
  available: boolean;
};

type ProvidersModelsCache = {
  groups: ProviderModelGroup[];
  cachedAt: number;
};

let providersModelsCache: ProvidersModelsCache | null = null;
const PROVIDERS_MODELS_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateProvidersModelsCache(): void {
  providersModelsCache = null;
}

export function buildProviderModelGroups(
  modelCatalog: ModelCatalogEntry[],
  filterProviderId?: string,
): { groups: ProviderModelGroup[]; cachedAt: number } {
  const nowMs = Date.now();

  // Use cache if still valid.
  if (
    providersModelsCache &&
    nowMs - providersModelsCache.cachedAt < PROVIDERS_MODELS_TTL_MS &&
    !filterProviderId
  ) {
    return providersModelsCache;
  }

  const groupMap = new Map<string, ProviderModelGroup>();

  for (const entry of modelCatalog) {
    if (filterProviderId && entry.provider !== filterProviderId) continue;

    let group = groupMap.get(entry.provider);
    if (!group) {
      group = { providerId: entry.provider, models: [], available: true };
      groupMap.set(entry.provider, group);
    }

    group.models.push({
      id: entry.id,
      name: entry.name,
      source: "builtin",
      ...(typeof entry.driverId === "string" && entry.driverId.trim()
        ? { driverId: entry.driverId }
        : {}),
      ...(typeof entry.modelRoute === "string" && entry.modelRoute.trim()
        ? { modelRoute: entry.modelRoute }
        : {}),
      ...(typeof entry.toolMode === "boolean" ? { toolMode: entry.toolMode } : {}),
      ...(entry.toolContract && typeof entry.toolContract === "object"
        ? { toolContract: entry.toolContract as Record<string, unknown> }
        : {}),
      contextWindow: entry.contextWindow,
      reasoning: entry.reasoning,
      input: entry.input as Array<"text" | "image"> | undefined,
    });
  }

  const groups = [...groupMap.values()].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );

  const result = { groups, cachedAt: nowMs };

  // Only cache unfiltered results.
  if (!filterProviderId) {
    providersModelsCache = result;
  }

  return result;
}
