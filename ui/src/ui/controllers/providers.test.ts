import { describe, expect, it, vi } from "vitest";
import type { ProvidersState } from "./providers.ts";
import {
  deleteProviderCredential,
  loadProviders,
  saveProviderCredential,
  testProviderCredential,
} from "./providers.ts";

function createState(overrides: Partial<ProvidersState> = {}): ProvidersState {
  return {
    client: null,
    connected: true,
    providersLoading: false,
    providersSaving: false,
    providersTesting: false,
    providersError: null,
    providersNotice: null,
    providersRegistry: [],
    providersModels: [],
    providersSelectedId: null,
    providerCredentialDrafts: {},
    providerCredentialTypes: {},
    providerCredentialProfiles: {},
    providerTestResults: {},
    ...overrides,
  };
}

describe("providers controller", () => {
  it("loads registry/models/credentials and maps profile ids", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "providers.registry.list") {
        return { providers: [{ id: "openai", label: "OpenAI", hasCredential: false }] };
      }
      if (method === "providers.models.list") {
        return {
          providers: [{ providerId: "openai", available: true, models: [{ id: "gpt-5", name: "GPT-5" }] }],
        };
      }
      if (method === "providers.credentials.list") {
        return {
          credentials: [
            {
              profileId: "prof-openai",
              providerId: "openai",
              credentialType: "api_key",
              hasCredential: true,
            },
          ],
        };
      }
      return {};
    });
    const state = createState({
      client: { request } as unknown as ProvidersState["client"],
    });

    await loadProviders(state);

    expect(state.providersRegistry).toHaveLength(1);
    expect(state.providersModels[0]?.providerId).toBe("openai");
    expect(state.providersModels[0]?.models[0]?.id).toBe("gpt-5");
    expect(state.providerCredentialProfiles.openai).toBe("prof-openai");
    expect(state.providersSelectedId).toBe("openai");
  });

  it("sends credential field key when type is api_key", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "providers.credentials.upsert") {
        return { ok: true };
      }
      return { providers: [], credentials: [] };
    });
    const state = createState({
      client: { request } as unknown as ProvidersState["client"],
      providerCredentialDrafts: { openai: "sk-test" },
      providerCredentialTypes: { openai: "api_key" },
    });

    await saveProviderCredential(state, "openai");

    expect(request).toHaveBeenCalledWith(
      "providers.credentials.upsert",
      expect.objectContaining({
        providerId: "openai",
        credentialType: "api_key",
        key: "sk-test",
      }),
    );
  });

  it("sends credential field token when type is token", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "providers.credentials.upsert") {
        return { ok: true };
      }
      return { providers: [], credentials: [] };
    });
    const state = createState({
      client: { request } as unknown as ProvidersState["client"],
      providerCredentialDrafts: { deepseek: "tok-1" },
      providerCredentialTypes: { deepseek: "token" },
    });

    await saveProviderCredential(state, "deepseek");

    expect(request).toHaveBeenCalledWith(
      "providers.credentials.upsert",
      expect.objectContaining({
        providerId: "deepseek",
        credentialType: "token",
        token: "tok-1",
      }),
    );
  });

  it("requires profile id for delete and calls delete with profileId", async () => {
    const request = vi.fn(async () => ({ providers: [], credentials: [] }));
    const state = createState({
      client: { request } as unknown as ProvidersState["client"],
      providerCredentialProfiles: { openai: "prof-openai" },
    });

    await deleteProviderCredential(state, "openai");

    expect(request).toHaveBeenCalledWith("providers.credentials.delete", {
      profileId: "prof-openai",
    });
  });

  it("requires profile id for test and stores success result", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "providers.credentials.test") {
        return { ok: true, latencyMs: 42 };
      }
      return { providers: [], credentials: [] };
    });
    const state = createState({
      client: { request } as unknown as ProvidersState["client"],
      providerCredentialProfiles: { openai: "prof-openai" },
    });

    await testProviderCredential(state, "openai");

    expect(request).toHaveBeenCalledWith("providers.credentials.test", {
      profileId: "prof-openai",
    });
    expect(state.providerTestResults.openai?.ok).toBe(true);
    expect(state.providerTestResults.openai?.message).toContain("42ms");
  });
});

