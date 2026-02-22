import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/config.js", () => {
  return {
    loadConfig: () => ({
      skills: {
        entries: {
          reporting: {
            env: {
              OPENCLAW_EXTERNAL_ENDPOINT: "https://example.test/skill",
            },
          },
        },
      },
    }),
    writeConfigFile: async () => {},
  };
});

const { skillsHandlers } = await import("./skills.js");

describe("skills.remote.test", () => {
  it("returns invalid request when endpoint is missing", async () => {
    let ok: boolean | null = null;
    let error: unknown = null;
    await skillsHandlers["skills.remote.test"]({
      params: {
        skillKey: "missing-endpoint",
      },
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (success, _result, err) => {
        ok = success;
        error = err;
      },
    });

    expect(ok).toBe(false);
    expect(error).toBeTruthy();
  });

  it("probes remote endpoint and returns status/latency/body", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    let ok: boolean | null = null;
    let result: unknown = null;
    await skillsHandlers["skills.remote.test"]({
      params: {
        skillKey: "reporting",
        payload: '{"jobId":"123"}',
      },
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (success, value) => {
        ok = success;
        result = value;
      },
    });

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      endpoint: "https://example.test/skill",
      status: 200,
      bodyPreview: '{"ok":true}',
    });
    vi.unstubAllGlobals();
  });
});
