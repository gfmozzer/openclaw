import { afterEach, describe, expect, it, vi } from "vitest";
import { incrementEnterpriseMetric, resetEnterpriseMetricsForTest } from "./runtime-metrics.js";
import { startGatewayMaintenanceTimers } from "./server-maintenance.js";

afterEach(() => {
  vi.useRealTimers();
  resetEnterpriseMetricsForTest();
});

describe("startGatewayMaintenanceTimers", () => {
  it("emits alert log on auth deny spike", async () => {
    vi.useFakeTimers();
    resetEnterpriseMetricsForTest();
    const warn = vi.fn();

    const timers = startGatewayMaintenanceTimers({
      broadcast: vi.fn(),
      nodeSendToAllSubscribed: vi.fn(),
      getPresenceVersion: () => 1,
      getHealthVersion: () => 1,
      refreshGatewayHealthSnapshot: vi.fn(async () => ({ ts: Date.now() } as never)),
      logHealth: { error: vi.fn() },
      logGateway: { warn },
      dedupe: new Map(),
      chatAbortControllers: new Map(),
      chatRunState: { abortedRuns: new Map() },
      chatRunBuffers: new Map(),
      chatDeltaSentAt: new Map(),
      removeChatRun: vi.fn(),
      agentRunSeq: new Map(),
      nodeSendToSession: vi.fn(),
    });

    incrementEnterpriseMetric("auth_denied_total", 20);
    await vi.advanceTimersByTimeAsync(60_000);

    clearInterval(timers.tickInterval);
    clearInterval(timers.healthInterval);
    clearInterval(timers.dedupeCleanup);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("alert auth deny spike authDeniedDelta=20"),
    );
  });

  it("emits alert log on idempotency/lock failures", async () => {
    vi.useFakeTimers();
    resetEnterpriseMetricsForTest();
    const warn = vi.fn();

    const timers = startGatewayMaintenanceTimers({
      broadcast: vi.fn(),
      nodeSendToAllSubscribed: vi.fn(),
      getPresenceVersion: () => 1,
      getHealthVersion: () => 1,
      refreshGatewayHealthSnapshot: vi.fn(async () => ({ ts: Date.now() } as never)),
      logHealth: { error: vi.fn() },
      logGateway: { warn },
      dedupe: new Map(),
      chatAbortControllers: new Map(),
      chatRunState: { abortedRuns: new Map() },
      chatRunBuffers: new Map(),
      chatDeltaSentAt: new Map(),
      removeChatRun: vi.fn(),
      agentRunSeq: new Map(),
      nodeSendToSession: vi.fn(),
    });

    incrementEnterpriseMetric("idempotency_lock_failures_total", 1);
    await vi.advanceTimersByTimeAsync(60_000);

    clearInterval(timers.tickInterval);
    clearInterval(timers.healthInterval);
    clearInterval(timers.dedupeCleanup);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("alert idempotency/lock failures idempotencyFailureDelta=1"),
    );
  });
});
