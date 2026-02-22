import { afterEach, describe, expect, it, vi } from "vitest";
import { chatPortalHandlers } from "./chat-portal.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("chat portal handlers", () => {
  it("returns portal contract for rich chat blocks", () => {
    const respond = vi.fn();
    chatPortalHandlers["chat.portal.contract"]({
      params: {},
      respond,
      context: {} as never,
      client: null,
      req: { type: "req", id: "1", method: "chat.portal.contract" },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        chatFirst: true,
        richBlocks: expect.objectContaining({
          supportedTypes: expect.arrayContaining(["dashboard", "chart", "table"]),
        }),
      }),
      undefined,
    );
  });

  it("returns stack status with skipped probes when env is not configured", async () => {
    delete process.env.OPENCLAW_REDIS_URL;
    delete process.env.OPENCLAW_S3_BUCKET;
    delete process.env.DATABASE_URL;

    const respond = vi.fn();
    await chatPortalHandlers["chat.portal.stack.status"]({
      params: {},
      respond,
      context: {} as never,
      client: null,
      req: { type: "req", id: "2", method: "chat.portal.stack.status" },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        drivers: expect.objectContaining({
          defaultDriver: "native",
          enabled: expect.arrayContaining(["native"]),
          loaded: expect.arrayContaining(["native"]),
          details: expect.arrayContaining([
            expect.objectContaining({
              driverId: "native",
              source: "builtin",
              enabled: true,
              loaded: true,
            }),
          ]),
        }),
        probes: {
          redis: expect.objectContaining({ configured: false, state: "skipped" }),
          s3: expect.objectContaining({ configured: false, state: "skipped" }),
          postgres: expect.objectContaining({ configured: false, state: "skipped" }),
        },
      }),
      undefined,
    );
  });
});
