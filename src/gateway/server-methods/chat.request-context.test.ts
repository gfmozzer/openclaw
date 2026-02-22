import { describe, expect, it } from "vitest";
import { validateChatSendParams } from "../protocol/index.js";

describe("chat.send request context foundation compat", () => {
  it("accepts legacy payload without new override fields", () => {
    const ok = validateChatSendParams({
      sessionKey: "session-1",
      message: "hello",
      idempotencyKey: "idem-1",
      overrides: {
        provider: "openai",
        model: "gpt-4o-mini",
      },
    });
    expect(ok).toBe(true);
  });

  it("accepts optimization override hints as optional fields", () => {
    const ok = validateChatSendParams({
      sessionKey: "session-1",
      message: "hello",
      idempotencyKey: "idem-1",
      overrides: {
        provider: "openai",
        model: "gpt-4o-mini",
        optimizationMode: "economy",
        contextPolicy: "lean",
        routingHints: {
          preferCheap: true,
          preferFast: true,
          allowEscalation: false,
          escalationThreshold: 5,
        },
        budgetPolicyRef: "tenant-budget",
      },
    });
    expect(ok).toBe(true);
  });
});

