import { describe, expect, it } from "vitest";
import { incrementEnterpriseMetric, resetEnterpriseMetricsForTest } from "../runtime-metrics.js";
import { systemHandlers } from "./system.js";

describe("system.metrics", () => {
  it("returns enterprise counters snapshot", () => {
    resetEnterpriseMetricsForTest();
    incrementEnterpriseMetric("auth_denied_total");
    incrementEnterpriseMetric("schedule_requests_total", 2);

    const respond = (
      ok: boolean,
      payload?: unknown,
      _error?: unknown,
      _meta?: Record<string, unknown>,
    ) => {
      expect(ok).toBe(true);
      expect(payload).toMatchObject({
        counters: {
          auth_denied_total: 1,
          schedule_requests_total: 2,
          schedule_denied_total: 0,
          workflow_resume_failures_total: 0,
        },
      });
    };

    systemHandlers["system.metrics"]({
      params: {},
      respond,
      context: {} as never,
      client: null,
      req: { type: "req", id: "1", method: "system.metrics" },
      isWebchatConnect: () => false,
    });
  });
});

