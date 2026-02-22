import { describe, expect, it, vi } from "vitest";

vi.mock("../session-utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../session-utils.js")>();
  return {
    ...original,
    loadSessionEntry: () => ({
      cfg: {},
      storePath: "",
      entry: { sessionId: "sess-1", channel: "web", chatType: "direct" },
      canonicalKey: "main",
    }),
  };
});

const { chatHandlers } = await import("./chat.js");

function createMinimalContext() {
  return {
    requestSource: "operator_ui" as const,
    chatAbortControllers: new Map(),
    chatRunBuffers: new Map(),
    chatDeltaSentAt: new Map(),
    chatAbortedRuns: new Map(),
    removeChatRun: vi.fn(),
    addChatRun: vi.fn(),
    registerToolEventRecipient: vi.fn(),
    dedupe: new Map(),
    agentRunSeq: new Map(),
    wizardSessions: new Map(),
    findRunningWizard: vi.fn(),
    purgeWizardSession: vi.fn(),
    getRuntimeSnapshot: vi.fn(),
    startChannel: vi.fn(),
    stopChannel: vi.fn(),
    markChannelLoggedOut: vi.fn(),
    wizardRunner: vi.fn(),
    broadcastVoiceWakeChanged: vi.fn(),
    logGateway: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    tenantContext: undefined,
    enterprisePrincipal: undefined,
    broadcast: vi.fn(),
    broadcastToConnIds: vi.fn(),
    nodeSendToSession: vi.fn(),
    nodeSendToAllSubscribed: vi.fn(),
    nodeSubscribe: vi.fn(),
    nodeUnsubscribe: vi.fn(),
    nodeUnsubscribeAll: vi.fn(),
    hasConnectedMobileNode: vi.fn(),
    nodeRegistry: { register: vi.fn() },
    chatRunBuffersMap: new Map(),
  };
}

describe("chat.send override source policy", () => {
  it("rejects sensitive/channel capability overrides from channel_direct", async () => {
    const respond = vi.fn();
    const context = createMinimalContext();

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "ping",
        idempotencyKey: "idem-1",
        requestContext: { requestSource: "channel_direct" },
        overrides: {
          apiKey: "sk-test",
          skillAllowlist: ["finance"],
          optimizationMode: "economy",
        },
      },
      respond,
      context: context as never,
      req: {} as never,
      client: {
        connect: { role: "operator", scopes: ["admin"] },
      } as never,
      isWebchatConnect: () => false,
    });

    const [ok, payload, error] = respond.mock.calls.at(-1) ?? [];
    expect(ok).toBe(false);
    expect(payload).toBeUndefined();
    expect(error?.code).toBe("FORBIDDEN");
    expect(String(error?.message ?? "")).toContain("channel_direct");
  });

  it("drops optimization hints from channel_direct but keeps non-sensitive model override", async () => {
    const respond = vi.fn();
    const context = createMinimalContext();
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    vi.stubEnv("OPENCLAW_DRIVER_LITELLM_ENABLED", "0");

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "ping",
        idempotencyKey: "idem-2",
        requestContext: { requestSource: "channel_direct" },
        overrides: {
          model: "litellm::openai/gpt-4o-mini",
          optimizationMode: "economy",
        },
      },
      respond,
      context: context as never,
      req: {} as never,
      client: {
        connect: { role: "operator", scopes: ["operator.write"] },
      } as never,
      isWebchatConnect: () => false,
    });

    const [ok, _payload, error] = respond.mock.calls.at(-1) ?? [];
    expect(ok).toBe(false);
    // Proves request was not rejected by optimization hint alone; it reached driver validation.
    expect(error?.code).toBe("INVALID_REQUEST");
    expect(String(error?.message ?? "")).toContain('driver "litellm"');
  });
});
