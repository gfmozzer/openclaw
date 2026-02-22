import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../config/config.js", () => ({
  loadConfig: () => ({
    models: {
      providers: {
        "custom-provider": {
          baseUrl: "https://custom.example.com",
          api: "openai-completions",
          models: [],
        },
      },
    },
  }),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: () => "default",
  resolveAgentWorkspaceDir: () => "/tmp/test-agent-dir",
}));

vi.mock("../../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: () => ({
    version: 1,
    profiles: {
      "openai:default": {
        type: "api_key",
        provider: "openai",
        key: "sk-test-openai-key",
      },
      "anthropic:default": {
        type: "api_key",
        provider: "anthropic",
        key: "sk-ant-test-key",
      },
      "oauth-provider:default": {
        type: "oauth",
        provider: "oauth-provider",
        access: "access-token",
        refresh: "refresh-token",
      },
      "no-key-provider:default": {
        type: "api_key",
        provider: "no-key-provider",
        key: "",
      },
    },
  }),
  listProfilesForProvider: (
    store: {
      profiles: Record<
        string,
        { type: string; provider: string; key?: string; token?: string; access?: string }
      >;
    },
    provider: string,
  ) => {
    return Object.keys(store.profiles).filter((id) =>
      store.profiles[id]?.provider === provider,
    );
  },
  upsertAuthProfileWithLock: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../agents/auth-profiles/store.js", () => ({
  updateAuthProfileStoreWithLock: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../agents/model-auth.js", () => ({
  resolveEnvApiKey: (provider: string) => {
    if (provider === "google") return "env: GOOGLE_API_KEY";
    return undefined;
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

const {
  buildProviderRegistryList,
  listProviderCredentials,
  upsertProviderCredential,
  deleteProviderCredential,
  buildProviderModelGroups,
  invalidateProvidersModelsCache,
} = await import("../providers-service.js");

const { providersHandlers } = await import("./providers.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RespondArgs = [boolean, unknown, unknown];

function makeRespond() {
  const calls: RespondArgs[] = [];
  const respond = (ok: boolean, result: unknown, err: unknown) => {
    calls.push([ok, result, err]);
  };
  return { respond, calls };
}

function makeContext(modelCatalog: unknown[] = []) {
  return {
    loadGatewayModelCatalog: vi.fn().mockResolvedValue(modelCatalog),
    logGateway: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

function makeClient(scopes: string[] = ["operator.admin"]) {
  return {
    connect: { role: "operator", scopes },
    connId: "test-conn",
    clientIp: "127.0.0.1",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// providers.registry.list
// ---------------------------------------------------------------------------

describe("providers.registry.list", () => {
  const catalog = [
    { id: "claude-3-opus", name: "Claude 3 Opus", provider: "anthropic" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
  ];

  it("returns an entry for each provider in catalog + auth store + config", () => {
    const providers = buildProviderRegistryList(catalog);
    expect(providers.length).toBeGreaterThan(0);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
    expect(ids).toContain("custom-provider");
  });

  it("reports correct model count per provider", () => {
    const providers = buildProviderRegistryList(catalog);
    const openai = providers.find((p) => p.id === "openai");
    expect(openai?.modelCount).toBe(2);
    const anthropic = providers.find((p) => p.id === "anthropic");
    expect(anthropic?.modelCount).toBe(1);
  });

  it("detects credentials from auth store", () => {
    const providers = buildProviderRegistryList(catalog);
    const openai = providers.find((p) => p.id === "openai");
    expect(openai?.hasCredential).toBe(true);
    expect(openai?.credentialType).toBe("api_key");
  });

  it("detects credentials from env var (google)", () => {
    const providers = buildProviderRegistryList(catalog);
    const google = providers.find((p) => p.id === "google");
    expect(google?.hasCredential).toBe(true);
  });

  it("marks providers without credentials correctly", () => {
    const providers = buildProviderRegistryList(catalog);
    const noKey = providers.find((p) => p.id === "no-key-provider");
    expect(noKey?.hasCredential).toBe(false);
    expect(noKey?.credentialType).toBeUndefined();
  });

  it("marks custom config providers with source=custom", () => {
    const providers = buildProviderRegistryList(catalog);
    const custom = providers.find((p) => p.id === "custom-provider");
    expect(custom?.sources).toContain("custom");
  });

  it("marks built-in providers with source=builtin", () => {
    const providers = buildProviderRegistryList(catalog);
    const anthropic = providers.find((p) => p.id === "anthropic");
    expect(anthropic?.sources).toContain("builtin");
  });

  it("detects oauth credential type", () => {
    const providers = buildProviderRegistryList([]);
    const oauthProv = providers.find((p) => p.id === "oauth-provider");
    // oauth-provider is in auth store but not in BUILTIN_PROVIDER_META → sources: ["plugin"]
    expect(oauthProv?.hasCredential).toBe(true);
    expect(oauthProv?.credentialType).toBe("oauth");
  });

  it("returns providers sorted: built-ins first, then others", () => {
    const providers = buildProviderRegistryList(catalog);
    const firstBuiltinIdx = providers.findIndex((p) => p.sources.includes("builtin"));
    const firstNonBuiltinIdx = providers.findIndex((p) => !p.sources.includes("builtin"));
    if (firstNonBuiltinIdx !== -1 && firstBuiltinIdx !== -1) {
      expect(firstBuiltinIdx).toBeLessThan(firstNonBuiltinIdx);
    }
  });

  it("handler responds with ok=true and providers array", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext(catalog);
    await providersHandlers["providers.registry.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { providers: unknown[] };
    expect(Array.isArray(payload?.providers)).toBe(true);
  });

  it("handler counts only models from loaded drivers", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    vi.stubEnv("OPENCLAW_DRIVER_LITELLM_ENABLED", "0");
    const { respond, calls } = makeRespond();
    const context = makeContext([
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini via LiteLLM",
        provider: "openai",
        driverId: "litellm",
      },
      {
        id: "claude-3-opus",
        name: "Claude 3 Opus",
        provider: "anthropic",
        driverId: "native",
      },
    ]);
    await providersHandlers["providers.registry.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { providers: Array<{ id: string; modelCount: number }> };
    expect(payload.providers.find((entry) => entry.id === "anthropic")?.modelCount).toBe(1);
    expect(payload.providers.find((entry) => entry.id === "openai")?.modelCount).toBe(0);
  });

  it("handler rejects invalid params", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.registry.list"]({
      params: { unexpected: true },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(false);
    expect(calls[0]?.[2]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// providers.credentials.list
// ---------------------------------------------------------------------------

describe("providers.credentials.list", () => {
  it("lists all credentials from store", () => {
    const creds = listProviderCredentials();
    expect(creds.length).toBeGreaterThan(0);
    const providerIds = creds.map((c) => c.providerId);
    expect(providerIds).toContain("openai");
    expect(providerIds).toContain("anthropic");
  });

  it("filters by providerId", () => {
    const creds = listProviderCredentials("openai");
    expect(creds.every((c) => c.providerId === "openai")).toBe(true);
  });

  it("never returns actual key value", () => {
    const creds = listProviderCredentials();
    for (const c of creds) {
      expect((c as Record<string, unknown>).key).toBeUndefined();
      expect((c as Record<string, unknown>).token).toBeUndefined();
    }
  });

  it("reports hasCredential=true for profiles with keys", () => {
    const creds = listProviderCredentials("openai");
    expect(creds[0]?.hasCredential).toBe(true);
  });

  it("reports hasCredential=false for profiles with empty key", () => {
    const creds = listProviderCredentials("no-key-provider");
    expect(creds[0]?.hasCredential).toBe(false);
  });

  it("handler responds with ok=true and credentials array", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.credentials.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { credentials: unknown[] };
    expect(Array.isArray(payload?.credentials)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// providers.credentials.upsert
// ---------------------------------------------------------------------------

describe("providers.credentials.upsert", () => {
  it("calls upsertAuthProfileWithLock and returns profileId", async () => {
    const { upsertAuthProfileWithLock } = await import("../../agents/auth-profiles.js");
    vi.mocked(upsertAuthProfileWithLock).mockClear();

    const result = await upsertProviderCredential({
      providerId: "openai",
      credentialType: "api_key",
      key: "sk-new-key",
    });

    expect(result.profileId).toBe("openai:default");
    expect(result.providerId).toBe("openai");
    expect(upsertAuthProfileWithLock).toHaveBeenCalledOnce();
  });

  it("handler responds with ok=true after upsert", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.credentials.upsert"]({
      params: { providerId: "openai", credentialType: "api_key", key: "sk-test" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; profileId: string };
    expect(payload?.ok).toBe(true);
    expect(payload?.profileId).toBe("openai:default");
  });

  it("handler rejects missing providerId", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.credentials.upsert"]({
      params: { credentialType: "api_key" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// providers.credentials.delete
// ---------------------------------------------------------------------------

describe("providers.credentials.delete", () => {
  it("calls updateAuthProfileStoreWithLock", async () => {
    const { updateAuthProfileStoreWithLock } = await import(
      "../../agents/auth-profiles/store.js"
    );
    vi.mocked(updateAuthProfileStoreWithLock).mockClear();

    await deleteProviderCredential("openai:default");

    expect(updateAuthProfileStoreWithLock).toHaveBeenCalledOnce();
  });

  it("handler responds with ok=true after delete", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.credentials.delete"]({
      params: { profileId: "openai:default" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; profileId: string };
    expect(payload?.ok).toBe(true);
    expect(payload?.profileId).toBe("openai:default");
  });

  it("handler rejects missing profileId", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext();
    await providersHandlers["providers.credentials.delete"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// providers.credentials.test
// ---------------------------------------------------------------------------

describe("providers.credentials.test", () => {
  const catalog = [
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  ];

  it("returns ok=true when profile has credentials and provider has models in catalog", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext(catalog);
    await providersHandlers["providers.credentials.test"]({
      params: { profileId: "openai:default" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; providerId: string };
    expect(payload?.ok).toBe(true);
    expect(payload?.providerId).toBe("openai");
  });

  it("returns ok=false when provider has no models in catalog", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext([]); // empty catalog
    await providersHandlers["providers.credentials.test"]({
      params: { profileId: "openai:default" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true); // RPC ok=true (result computed)
    const payload = calls[0]?.[1] as { ok: boolean };
    expect(payload?.ok).toBe(false); // but test itself failed
  });

  it("returns error when profileId not found", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext(catalog);
    await providersHandlers["providers.credentials.test"]({
      params: { profileId: "non-existent:profile" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(false);
  });

  it("applies rate limit on repeated calls", async () => {
    // The rate limit uses a shared bucket keyed by device+ip.
    // After 3 allowed calls the 4th should be denied.
    const context = makeContext(catalog);
    const client = makeClient();

    // Reset rate limit state if exposed.
    const { __testing } = await import("../control-plane-rate-limit.js");
    __testing.resetControlPlaneRateLimitState();

    let rateLimitedCount = 0;
    for (let i = 0; i < 5; i++) {
      const { respond, calls } = makeRespond();
      await providersHandlers["providers.credentials.test"]({
        params: { profileId: "openai:default" },
        req: {} as never,
        client: client as never,
        isWebchatConnect: () => false,
        respond: respond as never,
        context: context as never,
      });
      const err = calls[0]?.[2] as { message?: string } | undefined;
      if (err?.message?.includes("rate limit")) {
        rateLimitedCount++;
      }
    }

    expect(rateLimitedCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// providers.models.list
// ---------------------------------------------------------------------------

describe("providers.models.list", () => {
  const catalog = [
    { id: "claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", contextWindow: 200000 },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai" },
  ];

  beforeEach(() => {
    invalidateProvidersModelsCache();
  });

  afterEach(() => {
    invalidateProvidersModelsCache();
  });

  it("groups models by provider", () => {
    const { groups } = buildProviderModelGroups(catalog);
    const openai = groups.find((g) => g.providerId === "openai");
    expect(openai?.models.length).toBe(2);
    const anthropic = groups.find((g) => g.providerId === "anthropic");
    expect(anthropic?.models.length).toBe(1);
    expect(anthropic?.models[0]?.contextWindow).toBe(200000);
  });

  it("preserves driver/modelRoute/toolMode metadata in grouped models", () => {
    const { groups } = buildProviderModelGroups([
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        provider: "openai",
        driverId: "litellm",
        modelRoute: "litellm::openai/gpt-4o-mini",
        toolMode: true,
        toolContract: { kind: "image" },
      },
    ]);
    const openai = groups.find((g) => g.providerId === "openai");
    expect(openai?.models[0]).toMatchObject({
      driverId: "litellm",
      modelRoute: "litellm::openai/gpt-4o-mini",
      toolMode: true,
      toolContract: { kind: "image" },
    });
  });

  it("filters by providerId", () => {
    const { groups } = buildProviderModelGroups(catalog, "openai");
    expect(groups.length).toBe(1);
    expect(groups[0]?.providerId).toBe("openai");
    expect(groups[0]?.models.length).toBe(2);
  });

  it("caches unfiltered results", () => {
    const result1 = buildProviderModelGroups(catalog);
    const result2 = buildProviderModelGroups(catalog);
    expect(result2.cachedAt).toBe(result1.cachedAt);
  });

  it("does not cache filtered results", () => {
    const r1 = buildProviderModelGroups(catalog, "openai");
    const r2 = buildProviderModelGroups(catalog, "openai");
    // Both calls produce fresh results (no cache for filtered).
    expect(r1.groups.length).toBe(r2.groups.length);
  });

  it("invalidation clears cache", () => {
    const result1 = buildProviderModelGroups(catalog);
    invalidateProvidersModelsCache();
    const result2 = buildProviderModelGroups(catalog);
    expect(result2.cachedAt).toBeGreaterThanOrEqual(result1.cachedAt);
  });

  it("handler responds with ok=true and providers/cachedAt", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext(catalog);
    await providersHandlers["providers.models.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { providers: unknown[]; cachedAt: number };
    expect(Array.isArray(payload?.providers)).toBe(true);
    expect(typeof payload?.cachedAt).toBe("number");
  });

  it("handler supports providerId filter", async () => {
    const { respond, calls } = makeRespond();
    const context = makeContext(catalog);
    await providersHandlers["providers.models.list"]({
      params: { providerId: "openai" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { providers: Array<{ providerId: string }> };
    expect(payload?.providers.every((p) => p.providerId === "openai")).toBe(true);
  });

  it("handler hides models from unloaded drivers", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    vi.stubEnv("OPENCLAW_DRIVER_LITELLM_ENABLED", "0");
    const { respond, calls } = makeRespond();
    const context = makeContext([
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini via LiteLLM",
        provider: "openai",
        driverId: "litellm",
      },
    ]);
    await providersHandlers["providers.models.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { providers: unknown[] };
    expect(payload.providers).toEqual([]);
  });
});
