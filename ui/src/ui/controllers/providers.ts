import type { GatewayBrowserClient } from "../gateway.ts";

export type ProviderCredentialType = "api_key" | "token" | "oauth" | "unknown";

export type ProviderRegistryEntry = {
  id: string;
  label?: string;
  sources?: Array<"plugin" | "builtin" | "custom">;
  hasCredential?: boolean;
  credentialType?: ProviderCredentialType;
  modelCount?: number;
  supportsCredentialTest?: boolean;
  supportsLiveModelDiscovery?: boolean;
};

export type ProviderModelEntry = {
  id: string;
  name: string;
  source?: "plugin" | "builtin" | "custom";
  driverId?: string;
  modelRoute?: string;
  toolMode?: boolean;
  toolContract?: Record<string, unknown>;
  contextWindow?: number;
  reasoning?: boolean;
};

export type ProviderModelsGroup = {
  providerId: string;
  available?: boolean;
  models: ProviderModelEntry[];
};

export type ProviderCredentialMeta = {
  profileId: string;
  providerId: string;
  credentialType: ProviderCredentialType;
  hasCredential: boolean;
  lastUpdatedAt?: number;
};

export type ProvidersState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  providersLoading: boolean;
  providersSaving: boolean;
  providersTesting: boolean;
  providersError: string | null;
  providersNotice: string | null;
  providersRegistry: ProviderRegistryEntry[];
  providersModels: ProviderModelsGroup[];
  providersSelectedId: string | null;
  providerCredentialDrafts: Record<string, string>;
  providerCredentialTypes: Record<string, ProviderCredentialType>;
  providerCredentialProfiles: Record<string, string>;
  providerTestResults: Record<string, { ok: boolean; message: string }>;
};

type ProvidersRegistryResponse = {
  providers?: ProviderRegistryEntry[];
};

type ProvidersModelsResponse = {
  providers?: Array<{ providerId?: string; available?: boolean; models?: ProviderModelEntry[] }>;
};

type ProvidersCredentialsListResponse = {
  credentials?: ProviderCredentialMeta[];
};

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMethodUnavailable(err: unknown): boolean {
  const message = normalizeError(err).toLowerCase();
  return (
    message.includes("unknown method") ||
    message.includes("not implemented") ||
    message.includes("providers rpc disabled")
  );
}

function pickCredentialSecret(
  type: ProviderCredentialType,
  value: string,
): { key?: string; token?: string; email?: string } {
  if (type === "token") {
    return { token: value };
  }
  if (type === "oauth") {
    return { email: value };
  }
  return { key: value };
}

function resolveProfileId(state: ProvidersState, providerId: string): string | null {
  const value = state.providerCredentialProfiles[providerId]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export async function loadProviders(state: ProvidersState) {
  if (!state.client || !state.connected || state.providersLoading) {
    return;
  }
  state.providersLoading = true;
  state.providersError = null;
  state.providersNotice = null;
  try {
    const [registryRes, modelsRes, credentialsRes] = await Promise.all([
      state.client.request<ProvidersRegistryResponse>("providers.registry.list", {}),
      state.client.request<ProvidersModelsResponse>("providers.models.list", {}),
      state.client.request<ProvidersCredentialsListResponse>("providers.credentials.list", {}),
    ]);
    state.providersRegistry = Array.isArray(registryRes?.providers) ? registryRes.providers : [];
    state.providersModels = Array.isArray(modelsRes?.providers)
      ? modelsRes.providers
          .map((entry) => ({
            providerId: String(entry?.providerId ?? "").trim(),
            available: Boolean(entry?.available),
            models: Array.isArray(entry?.models) ? entry.models : [],
          }))
          .filter((entry) => entry.providerId.length > 0)
      : [];
    const credentialProfiles: Record<string, string> = {};
    const credentialTypes: Record<string, ProviderCredentialType> = { ...state.providerCredentialTypes };
    const credentials = Array.isArray(credentialsRes?.credentials)
      ? credentialsRes.credentials
      : [];
    for (const credential of credentials) {
      const providerId = credential.providerId?.trim();
      const profileId = credential.profileId?.trim();
      if (!providerId || !profileId) {
        continue;
      }
      credentialProfiles[providerId] = profileId;
      if (credential.credentialType) {
        credentialTypes[providerId] = credential.credentialType;
      }
    }
    state.providerCredentialProfiles = credentialProfiles;
    state.providerCredentialTypes = credentialTypes;
    if (state.providersRegistry.length > 0 && !state.providersSelectedId) {
      state.providersSelectedId = state.providersRegistry[0].id;
    }
  } catch (err) {
    if (isMethodUnavailable(err)) {
      state.providersNotice =
        "Provider APIs ainda nao estao disponiveis no backend (Plano 0 em andamento).";
      state.providersRegistry = [];
      state.providersModels = [];
      return;
    }
    state.providersError = normalizeError(err);
  } finally {
    state.providersLoading = false;
  }
}

export function setProviderSelected(state: ProvidersState, providerId: string | null) {
  const trimmed = providerId?.trim() ?? "";
  state.providersSelectedId = trimmed.length > 0 ? trimmed : null;
}

export function setProviderCredentialDraft(
  state: ProvidersState,
  providerId: string,
  value: string,
) {
  state.providerCredentialDrafts = { ...state.providerCredentialDrafts, [providerId]: value };
}

export function setProviderCredentialType(
  state: ProvidersState,
  providerId: string,
  value: ProviderCredentialType,
) {
  state.providerCredentialTypes = { ...state.providerCredentialTypes, [providerId]: value };
}

export async function saveProviderCredential(state: ProvidersState, providerId: string) {
  if (!state.client || !state.connected || state.providersSaving) {
    return;
  }
  const secret = state.providerCredentialDrafts[providerId]?.trim() ?? "";
  if (!secret) {
    state.providersError = "Preencha a credencial antes de salvar.";
    return;
  }
  state.providersSaving = true;
  state.providersError = null;
  try {
    const credentialType = state.providerCredentialTypes[providerId] ?? "api_key";
    await state.client.request("providers.credentials.upsert", {
      providerId,
      credentialType,
      ...pickCredentialSecret(credentialType, secret),
    });
    state.providerCredentialDrafts = { ...state.providerCredentialDrafts, [providerId]: "" };
    await loadProviders(state);
  } catch (err) {
    state.providersError = normalizeError(err);
  } finally {
    state.providersSaving = false;
  }
}

export async function deleteProviderCredential(state: ProvidersState, providerId: string) {
  if (!state.client || !state.connected || state.providersSaving) {
    return;
  }
  state.providersSaving = true;
  state.providersError = null;
  try {
    const profileId = resolveProfileId(state, providerId);
    if (!profileId) {
      state.providersError = "Nenhum perfil de credencial encontrado para este provider.";
      return;
    }
    await state.client.request("providers.credentials.delete", { profileId });
    await loadProviders(state);
  } catch (err) {
    state.providersError = normalizeError(err);
  } finally {
    state.providersSaving = false;
  }
}

export async function testProviderCredential(state: ProvidersState, providerId: string) {
  if (!state.client || !state.connected || state.providersTesting) {
    return;
  }
  state.providersTesting = true;
  state.providersError = null;
  try {
    const profileId = resolveProfileId(state, providerId);
    if (!profileId) {
      state.providersError = "Salve a credencial primeiro para executar o teste.";
      return;
    }
    const result = (await state.client.request("providers.credentials.test", {
      profileId,
    })) as
      | { ok?: boolean; errorMessage?: string; errorCode?: string; latencyMs?: number }
      | undefined;
    state.providerTestResults = {
      ...state.providerTestResults,
      [providerId]: {
        ok: Boolean(result?.ok),
        message: String(
          result?.ok
            ? result?.latencyMs != null
              ? `OK (${result.latencyMs}ms)`
              : "OK"
            : result?.errorMessage ?? result?.errorCode ?? "Falha de validacao",
        ),
      },
    };
    await loadProviders(state);
  } catch (err) {
    const message = normalizeError(err);
    state.providerTestResults = {
      ...state.providerTestResults,
      [providerId]: {
        ok: false,
        message,
      },
    };
    state.providersError = message;
  } finally {
    state.providersTesting = false;
  }
}
