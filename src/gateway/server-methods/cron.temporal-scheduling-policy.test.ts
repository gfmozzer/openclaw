import { beforeEach, describe, expect, it, vi } from "vitest";
import { cronHandlers } from "./cron.js";
import type { GatewayRequestContext } from "./types.js";
import {
  getEnterpriseMetricsSnapshot,
  resetEnterpriseMetricsForTest,
} from "../runtime-metrics.js";

function createTemporalContext() {
  const registerWorkflow = vi.fn(async () => ({ workflowId: "wf-1", registeredAt: Date.now() }));
  const cancelWorkflow = vi.fn(async () => true);
  const getWorkflow = vi.fn(async () => null);
  const recordWorkflowCallback = vi.fn(async () => true);
  const pullResumeSignal = vi.fn(async () => null);
  const broadcast = vi.fn();
  const nodeSendToSession = vi.fn();

  const context = {
    cron: {
      wake: vi.fn(),
      list: vi.fn(),
      status: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      run: vi.fn(),
    },
    cronStorePath: "/tmp/cron.json",
    schedulerOrchestrator: {
      registerWorkflow,
      cancelWorkflow,
      getWorkflow,
      recordWorkflowCallback,
      pullResumeSignal,
    },
    broadcast,
    nodeSendToSession,
    logGateway: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as GatewayRequestContext;

  return {
    context,
    registerWorkflow,
    cancelWorkflow,
    recordWorkflowCallback,
    pullResumeSignal,
    broadcast,
    nodeSendToSession,
  };
}

describe("cron handlers temporal scheduling policy", () => {
  beforeEach(() => {
    process.env.OPENCLAW_CRON_ORCHESTRATION_MODE = "temporal";
    delete process.env.OPENCLAW_TEMPORAL_TEAM_MAP_JSON;
    resetEnterpriseMetricsForTest();
  });

  it("allows supervisor scheduling to worker in same team", async () => {
    process.env.OPENCLAW_TEMPORAL_TEAM_MAP_JSON = '{"tenant-a":{"super-1":["worker-1"]}}';
    const { context, registerWorkflow } = createTemporalContext();
    const respond = vi.fn();

    await cronHandlers["cron.add"]({
      params: {
        name: "weekly-report",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "generate report" },
        orchestration: {
          tenantId: "tenant-a",
          targetAgentId: "worker-1",
          caller: { agentId: "super-1", role: "supervisor" },
          idempotencyKey: "req-123",
        },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "1", method: "cron.add" },
      isWebchatConnect: () => false,
    });

    expect(registerWorkflow).toHaveBeenCalledTimes(1);
    expect(registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          tenantId: "tenant-a",
          agentId: "worker-1",
          jobId: expect.any(String),
        },
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({ name: "weekly-report" }), undefined);
    expect(getEnterpriseMetricsSnapshot().counters.schedule_requests_total).toBe(1);
  });

  it("denies worker scheduling for another worker", async () => {
    const { context, registerWorkflow } = createTemporalContext();
    const respond = vi.fn();

    await cronHandlers["cron.add"]({
      params: {
        name: "forbidden-peer",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "should fail" },
        orchestration: {
          tenantId: "tenant-a",
          targetAgentId: "worker-2",
          caller: { agentId: "worker-1", role: "worker" },
        },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "2", method: "cron.add" },
      isWebchatConnect: () => false,
    });

    expect(registerWorkflow).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "FORBIDDEN",
        details: expect.objectContaining({ reason: "SCHEDULE_FORBIDDEN" }),
      }),
    );
    const snapshot = getEnterpriseMetricsSnapshot();
    expect(snapshot.counters.schedule_requests_total).toBe(1);
    expect(snapshot.counters.schedule_denied_total).toBe(1);
  });

  it("denies cross-tenant scheduling for supervisor", async () => {
    process.env.OPENCLAW_TEMPORAL_TEAM_MAP_JSON = '{"tenant-a":{"super-1":["worker-1"]}}';
    const { context, registerWorkflow } = createTemporalContext();
    const respond = vi.fn();

    await cronHandlers["cron.add"]({
      params: {
        name: "cross-tenant",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "should fail" },
        orchestration: {
          tenantId: "tenant-a",
          targetTenantId: "tenant-b",
          targetAgentId: "worker-1",
          caller: { agentId: "super-1", role: "supervisor" },
        },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "3", method: "cron.add" },
      isWebchatConnect: () => false,
    });

    expect(registerWorkflow).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "FORBIDDEN",
        details: expect.objectContaining({ reason: "CROSS_TENANT_FORBIDDEN" }),
      }),
    );
    const snapshot = getEnterpriseMetricsSnapshot();
    expect(snapshot.counters.schedule_requests_total).toBe(1);
    expect(snapshot.counters.schedule_denied_total).toBe(1);
  });

  it("allows worker removing own scheduled workflow", async () => {
    const { context, cancelWorkflow } = createTemporalContext();
    const respond = vi.fn();

    await cronHandlers["cron.remove"]({
      params: {
        id: "job-1",
        orchestration: {
          tenantId: "tenant-a",
          targetAgentId: "worker-1",
          caller: { agentId: "worker-1", role: "worker" },
        },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "4", method: "cron.remove" },
      isWebchatConnect: () => false,
    });

    expect(cancelWorkflow).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      agentId: "worker-1",
      jobId: "job-1",
    });
    expect(respond).toHaveBeenCalledWith(true, { ok: true, removed: true }, undefined);
  });

  it("records callback and emits chat final when sessionKey is provided", async () => {
    const { context, recordWorkflowCallback, broadcast, nodeSendToSession } = createTemporalContext();
    const respond = vi.fn();

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-1",
        status: "succeeded",
        sessionKey: "session-a",
        resumeText: "resultado pronto",
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "5", method: "cron.callback" },
      isWebchatConnect: () => false,
    });

    expect(recordWorkflowCallback).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(
      "chat",
      expect.objectContaining({
        runId: "resume-corr-1",
        sessionKey: "session-a",
        state: "final",
      }),
    );
    expect(nodeSendToSession).toHaveBeenCalledWith(
      "session-a",
      "chat",
      expect.objectContaining({
        runId: "resume-corr-1",
        state: "final",
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, { ok: true, accepted: true }, undefined);
    expect(getEnterpriseMetricsSnapshot().counters.workflow_resume_failures_total).toBe(0);
  });

  it("pulls resume signal for tenant/agent", async () => {
    const { context, pullResumeSignal } = createTemporalContext();
    const respond = vi.fn();
    pullResumeSignal.mockResolvedValueOnce({
      correlationId: "corr-2",
      scope: { tenantId: "tenant-a", agentId: "worker-1", jobId: "job-2" },
      status: "succeeded",
      completedAt: Date.now(),
    } as never);

    await cronHandlers["cron.resume.pull"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "6", method: "cron.resume.pull" },
      isWebchatConnect: () => false,
    });

    expect(pullResumeSignal).toHaveBeenCalledWith({
      scope: { tenantId: "tenant-a", agentId: "worker-1" },
      correlationId: undefined,
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        signal: expect.objectContaining({
          correlationId: "corr-2",
        }),
      },
      undefined,
    );
    expect(getEnterpriseMetricsSnapshot().counters.workflow_resume_failures_total).toBe(0);
  });

  it("counts resume failures when callback is rejected", async () => {
    const { context, recordWorkflowCallback } = createTemporalContext();
    const respond = vi.fn();
    recordWorkflowCallback.mockResolvedValueOnce(false);

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-fail",
        status: "failed",
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "7", method: "cron.callback" },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(true, { ok: true, accepted: false }, undefined);
    expect(getEnterpriseMetricsSnapshot().counters.workflow_resume_failures_total).toBe(1);
  });

  it("counts resume failures when pull by correlationId misses", async () => {
    const { context, pullResumeSignal } = createTemporalContext();
    const respond = vi.fn();
    pullResumeSignal.mockResolvedValueOnce(null);

    await cronHandlers["cron.resume.pull"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        correlationId: "corr-missing",
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "8", method: "cron.resume.pull" },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(true, { signal: null }, undefined);
    expect(getEnterpriseMetricsSnapshot().counters.workflow_resume_failures_total).toBe(1);
  });
});
