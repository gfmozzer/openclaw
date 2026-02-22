import type { GatewayBrowserClient } from "../gateway.ts";
import type { ProviderCredentialType, ProviderModelEntry } from "./providers.ts";

export type DriverRegistryEntry = {
  driverId: string;
  enabled: boolean;
  loaded: boolean;
  source: "builtin" | "external";
  providerCount?: number;
  modelCount?: number;
  reason?: string;
};

export type DriverProviderEntry = {
  providerId: string;
  label: string;
  hasCredential: boolean;
  credentialType?: ProviderCredentialType;
  modelCount: number;
};

export type DriverProvidersGroup = {
  driverId: string;
  enabled: boolean;
  loaded: boolean;
  source: "builtin" | "external";
  providers: DriverProviderEntry[];
  reason?: string;
};

export type DriverModelsProviderGroup = {
  providerId: string;
  available?: boolean;
  models: ProviderModelEntry[];
};

export type DriverModelsGroup = {
  driverId: string;
  enabled: boolean;
  loaded: boolean;
  source: "builtin" | "external";
  providers: DriverModelsProviderGroup[];
  reason?: string;
};

export type DriverCredentialMeta = {
  profileId: string;
  providerId: string;
  credentialType: ProviderCredentialType;
  hasCredential: boolean;
  lastUpdatedAt?: number;
};

export type DriverSmokeResult = {
  ok: boolean;
  message: string;
};

export type DriversUiState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  driversUiLoading: boolean;
  driversUiSaving: boolean;
  driversUiTesting: boolean;
  driversUiError: string | null;
  driversUiNotice: string | null;
  driversRegistryRows: DriverRegistryEntry[];
  driversProviderMatrix: DriverProvidersGroup[];
  driversModelsTree: DriverModelsGroup[];
  driversSelectedId: string | null;
  driversSelectedProviderByDriver: Record<string, string>;
  driversCredentialDrafts: Record<string, string>;
  driversCredentialTypes: Record<string, ProviderCredentialType>;
  driversCredentialProfiles: Record<string, string>;
  driversCredentialSmokeResults: Record<string, DriverSmokeResult>;
  driversRouteSmokeResults: Record<string, DriverSmokeResult>;
};

type DriversRegistryResponse = {
  drivers?: DriverRegistryEntry[];
};
type DriversProvidersResponse = {
  drivers?: DriverProvidersGroup[];
};
type DriversModelsResponse = {
  drivers?: DriverModelsGroup[];
};
type DriversCredentialsListResponse = {
  credentials?: DriverCredentialMeta[];
};
type DriversCredentialsTestResponse = {
  ok?: boolean;
  errorMessage?: string;
  errorCode?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
};
type DriversSmokeTestResponse = {
  ok?: boolean;
  errorMessage?: string;
  errorCode?: string;
  latencyMs?: number;
  modelRoute?: string;
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

function keyForDriverProvider(driverId: string, providerId: string): string {
  return `${driverId}::${providerId}`;
}

function pickCredentialSecret(
  type: ProviderCredentialType,
  value: string,
): { key?: string; token?: string; email?: string } {
  if (type === "token") return { token: value };
  if (type === "oauth") return { email: value };
  return { key: value };
}

export function setDriversSelected(state: DriversUiState, driverId: string | null) {
  const trimmed = driverId?.trim() ?? "";
  state.driversSelectedId = trimmed || null;
}

export function setDriversSelectedProvider(
  state: DriversUiState,
  driverId: string,
  providerId: string | null,
) {
  const next = { ...state.driversSelectedProviderByDriver };
  const trimmed = providerId?.trim() ?? "";
  if (!trimmed) delete next[driverId];
  else next[driverId] = trimmed;
  state.driversSelectedProviderByDriver = next;
}

export function setDriversCredentialDraft(
  state: DriversUiState,
  driverId: string,
  providerId: string,
  value: string,
) {
  state.driversCredentialDrafts = {
    ...state.driversCredentialDrafts,
    [keyForDriverProvider(driverId, providerId)]: value,
  };
}

export function setDriversCredentialType(
  state: DriversUiState,
  driverId: string,
  providerId: string,
  value: ProviderCredentialType,
) {
  state.driversCredentialTypes = {
    ...state.driversCredentialTypes,
    [keyForDriverProvider(driverId, providerId)]: value,
  };
}

export async function loadDriversUi(state: DriversUiState) {
  if (!state.client || !state.connected || state.driversUiLoading) return;
  state.driversUiLoading = true;
  state.driversUiError = null;
  state.driversUiNotice = null;
  try {
    const [registryRes, providersRes, modelsRes, credentialsRes] = await Promise.all([
      state.client.request<DriversRegistryResponse>("drivers.registry.list", {}),
      state.client.request<DriversProvidersResponse>("drivers.providers.list", {}),
      state.client.request<DriversModelsResponse>("drivers.models.list", {}),
      state.client.request<DriversCredentialsListResponse>("drivers.credentials.list", {}),
    ]);

    state.driversRegistryRows = Array.isArray(registryRes?.drivers) ? registryRes.drivers : [];
    state.driversProviderMatrix = Array.isArray(providersRes?.drivers) ? providersRes.drivers : [];
    state.driversModelsTree = Array.isArray(modelsRes?.drivers) ? modelsRes.drivers : [];

    const profiles: Record<string, string> = {};
    const types: Record<string, ProviderCredentialType> = { ...state.driversCredentialTypes };
    const credentials = Array.isArray(credentialsRes?.credentials) ? credentialsRes.credentials : [];
    for (const cred of credentials) {
      const providerId = cred.providerId?.trim();
      const profileId = cred.profileId?.trim();
      if (!providerId || !profileId) continue;
      // Global provider credentials are visible under multiple drivers; copy to keys for known matrices.
      for (const group of state.driversProviderMatrix) {
        if (group.providers.some((p) => p.providerId === providerId)) {
          const key = keyForDriverProvider(group.driverId, providerId);
          profiles[key] = profileId;
          if (cred.credentialType) types[key] = cred.credentialType;
        }
      }
      // Fallback when provider is also driver-level credential (ex: fal)
      const fallbackKey = keyForDriverProvider(providerId, providerId);
      profiles[fallbackKey] ??= profileId;
      if (cred.credentialType) types[fallbackKey] ??= cred.credentialType;
    }
    state.driversCredentialProfiles = profiles;
    state.driversCredentialTypes = types;

    if (!state.driversSelectedId) {
      state.driversSelectedId = state.driversRegistryRows[0]?.driverId ?? state.driversProviderMatrix[0]?.driverId ?? null;
    }
    for (const group of state.driversProviderMatrix) {
      if (!state.driversSelectedProviderByDriver[group.driverId] && group.providers[0]?.providerId) {
        state.driversSelectedProviderByDriver = {
          ...state.driversSelectedProviderByDriver,
          [group.driverId]: group.providers[0].providerId,
        };
      }
    }
  } catch (err) {
    if (isMethodUnavailable(err)) {
      state.driversUiNotice =
        "Driver APIs ainda nao estao disponiveis no backend (habilite providers/drivers RPC e reinicie o gateway).";
      state.driversRegistryRows = [];
      state.driversProviderMatrix = [];
      state.driversModelsTree = [];
      return;
    }
    state.driversUiError = normalizeError(err);
  } finally {
    state.driversUiLoading = false;
  }
}

export async function saveDriverCredential(
  state: DriversUiState,
  driverId: string,
  providerId: string,
) {
  if (!state.client || !state.connected || state.driversUiSaving) return;
  const key = keyForDriverProvider(driverId, providerId);
  const secret = state.driversCredentialDrafts[key]?.trim() ?? "";
  if (!secret) {
    state.driversUiError = "Preencha a credencial antes de salvar.";
    return;
  }
  state.driversUiSaving = true;
  state.driversUiError = null;
  try {
    const credentialType = state.driversCredentialTypes[key] ?? "api_key";
    await state.client.request("drivers.credentials.upsert", {
      driverId,
      providerId,
      credentialType,
      ...pickCredentialSecret(credentialType, secret),
    });
    state.driversCredentialDrafts = { ...state.driversCredentialDrafts, [key]: "" };
    await loadDriversUi(state);
  } catch (err) {
    state.driversUiError = normalizeError(err);
  } finally {
    state.driversUiSaving = false;
  }
}

export async function deleteDriverCredential(
  state: DriversUiState,
  driverId: string,
  providerId: string,
) {
  if (!state.client || !state.connected || state.driversUiSaving) return;
  state.driversUiSaving = true;
  state.driversUiError = null;
  try {
    const key = keyForDriverProvider(driverId, providerId);
    const profileId = state.driversCredentialProfiles[key]?.trim();
    if (!profileId) {
      state.driversUiError = "Nenhum perfil de credencial encontrado para este driver/provider.";
      return;
    }
    await state.client.request("drivers.credentials.delete", { driverId, profileId });
    await loadDriversUi(state);
  } catch (err) {
    state.driversUiError = normalizeError(err);
  } finally {
    state.driversUiSaving = false;
  }
}

export async function testDriverCredential(
  state: DriversUiState,
  driverId: string,
  providerId: string,
) {
  if (!state.client || !state.connected || state.driversUiTesting) return;
  state.driversUiTesting = true;
  state.driversUiError = null;
  const key = keyForDriverProvider(driverId, providerId);
  try {
    const profileId = state.driversCredentialProfiles[key]?.trim();
    const result = (await state.client.request("drivers.credentials.test", {
      driverId,
      providerId,
      ...(profileId ? { profileId } : {}),
    })) as DriversCredentialsTestResponse | undefined;
    state.driversCredentialSmokeResults = {
      ...state.driversCredentialSmokeResults,
      [key]: {
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
    await loadDriversUi(state);
  } catch (err) {
    const message = normalizeError(err);
    state.driversCredentialSmokeResults = {
      ...state.driversCredentialSmokeResults,
      [key]: { ok: false, message },
    };
    state.driversUiError = message;
  } finally {
    state.driversUiTesting = false;
  }
}

export async function testDriverRoute(
  state: DriversUiState,
  driverId: string,
  providerId: string,
  modelRoute: string,
) {
  if (!state.client || !state.connected || state.driversUiTesting) return;
  state.driversUiTesting = true;
  state.driversUiError = null;
  try {
    const result = (await state.client.request("drivers.smoke.test", {
      level: "route",
      driverId,
      providerId,
      modelRoute,
    })) as DriversSmokeTestResponse | undefined;
    state.driversRouteSmokeResults = {
      ...state.driversRouteSmokeResults,
      [modelRoute]: {
        ok: Boolean(result?.ok),
        message: String(
          result?.ok
            ? result?.latencyMs != null
              ? `OK (${result.latencyMs}ms)`
              : "OK"
            : result?.errorMessage ?? result?.errorCode ?? "Falha de rota",
        ),
      },
    };
  } catch (err) {
    state.driversRouteSmokeResults = {
      ...state.driversRouteSmokeResults,
      [modelRoute]: { ok: false, message: normalizeError(err) },
    };
    state.driversUiError = normalizeError(err);
  } finally {
    state.driversUiTesting = false;
  }
}

