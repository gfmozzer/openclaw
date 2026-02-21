import { describe, expect, it, vi } from "vitest";
import { handleGatewayRequest } from "./server-methods.js";
import { getEnterpriseMetricsSnapshot, resetEnterpriseMetricsForTest } from "./runtime-metrics.js";

describe("gateway auth metrics", () => {
  it("increments auth_denied_total when scope check fails", async () => {
    resetEnterpriseMetricsForTest();
    const respond = vi.fn();

    await handleGatewayRequest({
      req: {
        type: "req",
        id: "1",
        method: "send",
        params: { to: "+15550000000", message: "hi", idempotencyKey: "idem-1" },
      },
      respond,
      client: {
        connect: {
          role: "operator",
          scopes: ["operator.read"],
          client: {
            id: "test",
            mode: "cli",
            version: "1.0.0",
          },
          minProtocol: 1,
          maxProtocol: 1,
        },
      } as never,
      isWebchatConnect: () => false,
      context: {
        logGateway: {
          warn: vi.fn(),
        },
      } as never,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: expect.stringContaining("missing scope") }),
    );
    expect(getEnterpriseMetricsSnapshot().counters.auth_denied_total).toBe(1);
  });
});

