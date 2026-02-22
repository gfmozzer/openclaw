import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config.js", () => ({
  loadConfig: () => ({ models: { providers: {} } }),
}));
vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: () => "default",
  resolveAgentWorkspaceDir: () => "/tmp/test-agent-dir",
}));
vi.mock("../../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: () => ({
    version: 1,
    profiles: {
      "openai:default": { type: "api_key", provider: "openai", key: "sk-test" },
      "fal:default": { type: "api_key", provider: "fal", key: "fal-key" },
    },
  }),
  listProfilesForProvider: (
    store: { profiles: Record<string, { provider?: string }> },
    provider: string,
  ) => Object.keys(store.profiles).filter((id) => store.profiles[id]?.provider === provider),
  upsertAuthProfileWithLock: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../agents/auth-profiles/store.js", () => ({
  updateAuthProfileStoreWithLock: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../agents/model-auth.js", () => ({
  resolveEnvApiKey: () => undefined,
}));

const { driversHandlers } = await import("./drivers.js");
const { providersHandlers } = await import("./providers.js");
const { listGatewayMethods } = await import("../server-methods-list.js");

type RespondArgs = [boolean, unknown, unknown];
function makeRespond() {
  const calls: RespondArgs[] = [];
  const respond = (ok: boolean, result: unknown, err: unknown) => {
    calls.push([ok, result, err]);
  };
  return { calls, respond };
}

function makeContext(modelCatalog: unknown[] = []) {
  return {
    loadGatewayModelCatalog: vi.fn().mockResolvedValue(modelCatalog),
    logGateway: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    auditEventStore: undefined,
    tenantContext: undefined,
  };
}

function makeClient(scopes: string[] = ["operator.admin"]) {
  return {
    connect: { role: "operator", scopes },
    connId: "test-conn",
    clientIp: "127.0.0.1",
  };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  const { __testing } = await import("../control-plane-rate-limit.js");
  __testing.resetControlPlaneRateLimitState();
});

describe("drivers handlers transition + dedicated methods", () => {
  it("keeps compatibility aliases for registry/models/credentials", () => {
    expect(driversHandlers["drivers.registry.list"]).not.toBe(
      providersHandlers["providers.registry.list"],
    );
    expect(driversHandlers["drivers.models.list"]).not.toBe(
      providersHandlers["providers.models.list"],
    );
    expect(driversHandlers["drivers.credentials.list"]).not.toBe(
      providersHandlers["providers.credentials.list"],
    );
    expect(driversHandlers["drivers.credentials.upsert"]).not.toBe(
      providersHandlers["providers.credentials.upsert"],
    );
    expect(driversHandlers["drivers.credentials.delete"]).not.toBe(
      providersHandlers["providers.credentials.delete"],
    );
    expect(driversHandlers["drivers.credentials.test"]).not.toBe(
      providersHandlers["providers.credentials.test"],
    );
    expect(driversHandlers["drivers.smoke.test"]).not.toBe(
      providersHandlers["providers.credentials.test"],
    );
  });

  it("exposes drivers.* methods in gateway method list", () => {
    const methods = listGatewayMethods();
    expect(methods).toContain("drivers.registry.list");
    expect(methods).toContain("drivers.providers.list");
    expect(methods).toContain("drivers.smoke.test");
  });

  it("drivers.providers.list returns driver->provider matrix for loaded catalog routes", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    const context = makeContext([
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        driverId: "native",
        modelRoute: "native::openai/gpt-4o",
      },
      {
        id: "flux-dev",
        name: "FLUX dev",
        provider: "fal",
        driverId: "fal",
        modelRoute: "fal::fal/flux-dev",
        toolMode: true,
      },
    ]);
    await driversHandlers["drivers.providers.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: context as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as {
      drivers: Array<{ driverId: string; providers: Array<{ providerId: string; modelCount: number }> }>;
    };
    expect(payload.drivers.find((d) => d.driverId === "native")?.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: "openai", modelCount: 1 })]),
    );
    expect(payload.drivers.find((d) => d.driverId === "fal")?.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ providerId: "fal", modelCount: 1 })]),
    );
  });

  it("drivers.registry.list returns per-driver counts", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.registry.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          driverId: "native",
          modelRoute: "native::openai/gpt-4o",
        },
        {
          id: "flux-dev",
          name: "FLUX dev",
          provider: "fal",
          driverId: "fal",
          modelRoute: "fal::fal/flux-dev",
        },
      ]) as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as {
      defaultDriver: string;
      drivers: Array<{ driverId: string; providerCount: number; modelCount: number }>;
    };
    expect(payload.defaultDriver).toBeDefined();
    expect(payload.drivers.find((d) => d.driverId === "native")).toMatchObject({
      providerCount: 1,
      modelCount: 1,
    });
    expect(payload.drivers.find((d) => d.driverId === "fal")).toMatchObject({
      providerCount: 1,
      modelCount: 1,
    });
  });

  it("drivers.models.list returns driver->provider->models tree", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.models.list"]({
      params: {},
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext([
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          driverId: "native",
          modelRoute: "native::openai/gpt-4o",
        },
        {
          id: "flux-dev",
          name: "FLUX dev",
          provider: "fal",
          driverId: "fal",
          modelRoute: "fal::fal/flux-dev",
          toolMode: true,
        },
      ]) as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as {
      drivers: Array<{
        driverId: string;
        providers: Array<{ providerId: string; models: Array<{ id: string; driverId?: string }> }>;
      }>;
    };
    const nativeDriver = payload.drivers.find((d) => d.driverId === "native");
    expect(nativeDriver?.providers[0]?.providerId).toBe("openai");
    expect(nativeDriver?.providers[0]?.models[0]?.id).toBe("gpt-4o");
    const falDriver = payload.drivers.find((d) => d.driverId === "fal");
    expect(falDriver?.providers[0]?.providerId).toBe("fal");
    expect(falDriver?.providers[0]?.models[0]?.driverId).toBe("fal");
  });

  it("drivers.smoke.test level=driver reports loaded status", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.smoke.test"]({
      params: { level: "driver", driverId: "native" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext() as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; level: string; driverId: string };
    expect(payload).toMatchObject({ ok: true, level: "driver", driverId: "native" });
  });

  it("drivers.smoke.test level=route distinguishes missing route", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.smoke.test"]({
      params: {
        level: "route",
        modelRoute: "native::openai/gpt-4o-mini",
      },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext([]) as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; errorCode?: string; details?: Record<string, unknown> };
    expect(payload.ok).toBe(false);
    expect(payload.errorCode).toBe("ROUTE_NOT_FOUND");
    expect(payload.details?.routeSmokeMode).toBe("catalog-availability");
  });

  it("drivers.credentials.list supports driver-level fallback provider (fal)", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.credentials.list"]({
      params: { driverId: "fal" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext() as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { credentials: Array<{ providerId: string }> };
    expect(payload.credentials.some((c) => c.providerId === "fal")).toBe(true);
  });

  it("drivers.credentials.upsert returns driverId/providerId in dedicated payload", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.credentials.upsert"]({
      params: { driverId: "fal", credentialType: "api_key", key: "fal-key-new" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext() as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; driverId?: string; providerId: string };
    expect(payload.ok).toBe(true);
    expect(payload.driverId).toBe("fal");
    expect(payload.providerId).toBe("fal");
  });

  it("drivers.credentials.test validates within selected driver", async () => {
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native,fal");
    vi.stubEnv("OPENCLAW_DRIVER_FAL_ENABLED", "1");
    const { respond, calls } = makeRespond();
    await driversHandlers["drivers.credentials.test"]({
      params: { driverId: "fal", providerId: "fal" },
      req: {} as never,
      client: makeClient() as never,
      isWebchatConnect: () => false,
      respond: respond as never,
      context: makeContext([
        {
          id: "flux-dev",
          name: "FLUX dev",
          provider: "fal",
          driverId: "fal",
          modelRoute: "fal::fal/flux-dev",
        },
      ]) as never,
    });
    expect(calls[0]?.[0]).toBe(true);
    const payload = calls[0]?.[1] as { ok: boolean; driverId?: string; providerId?: string };
    expect(payload.ok).toBe(true);
    expect(payload.driverId).toBe("fal");
    expect(payload.providerId).toBe("fal");
  });
});
