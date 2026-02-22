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
    trustedFrontdoorDispatch: undefined,
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
  };
}

describe("chat.send trusted frontdoor request context", () => {
  it("accepts trusted frontdoor requestContext and filters disallowed override fields", async () => {
    const respond = vi.fn();
    const context = createMinimalContext();
    vi.stubEnv("OPENCLAW_DRIVERS_ENABLED", "native");
    vi.stubEnv("OPENCLAW_DRIVER_LITELLM_ENABLED", "0");

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "ping",
        idempotencyKey: "idem-tf-1",
        requestContext: {
          requestSource: "trusted_frontdoor_api",
          trustedFrontdoor: {
            frontdoorId: "crm-main",
            claims: {
              tenantId: "tenant-a",
              principalId: "user-a",
              allowedOverrideFields: ["model"],
            },
          },
        },
        overrides: {
          model: "litellm::openai/gpt-4o-mini",
          systemPrompt: "should be stripped",
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
    // Request reaches model-driver validation, proving trusted frontdoor context and filtered override were accepted.
    expect(error?.code).toBe("INVALID_REQUEST");
    expect(String(error?.message ?? "")).toContain('driver "litellm"');
    expect(context.requestSource).toBe("trusted_frontdoor_api");
    expect((context as { trustedFrontdoorDispatch?: { claims?: { allowedOverrideFields?: string[] } } })
      .trustedFrontdoorDispatch?.claims?.allowedOverrideFields).toEqual(["model"]);
  });

  it("rejects trusted frontdoor request when claims are expired", async () => {
    const respond = vi.fn();
    const context = createMinimalContext();

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "ping",
        idempotencyKey: "idem-tf-expired",
        requestContext: {
          requestSource: "trusted_frontdoor_api",
          trustedFrontdoor: {
            frontdoorId: "crm-main",
            claims: {
              tenantId: "tenant-a",
              principalId: "user-a",
              expiresAt: Date.now() - 1_000,
              allowedOverrideFields: ["model"],
            },
          },
        },
        overrides: {
          model: "openai/gpt-4o-mini",
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

    const [ok, payload, error] = respond.mock.calls.at(-1) ?? [];
    expect(ok).toBe(false);
    expect(payload).toBeUndefined();
    expect(error?.code).toBe("FORBIDDEN");
    expect(String(error?.message ?? "")).toContain("expired");
  });
});
