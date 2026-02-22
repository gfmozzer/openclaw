import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cronHandlers } from "./cron.js";
import type { GatewayRequestContext } from "./types.js";
import {
  getEnterpriseMetricsSnapshot,
  resetEnterpriseMetricsForTest,
} from "../runtime-metrics.js";

function signCallback(params: {
  tenantId: string;
  agentId: string;
  jobId: string;
  correlationId: string;
  status: string;
  completedAt: number;
  timestamp: number;
  nonce: string;
  secret: string;
}): string {
  const payload = [
    params.tenantId,
    params.agentId,
    params.jobId,
    params.correlationId,
    params.status,
    String(params.completedAt),
    String(params.timestamp),
    params.nonce,
  ].join("\n");
  return createHmac("sha256", params.secret).update(payload).digest("hex");
}

function createTemporalContext(overrides?: Partial<GatewayRequestContext>) {
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
    enterprisePrincipal: {
      tenantId: "tenant-a",
      requesterId: "super-1",
      role: "supervisor",
      scopes: ["jobs:schedule:self", "jobs:schedule:team", "jobs:cancel:self", "jobs:cancel:team"],
    },
    ...overrides,
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
    process.env.OPENCLAW_TEMPORAL_CALLBACK_SECRET = "test-callback-secret";
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
          targetAgentId: "worker-1",
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
    const { context, registerWorkflow } = createTemporalContext({
      enterprisePrincipal: {
        tenantId: "tenant-a",
        requesterId: "worker-1",
        role: "worker",
        scopes: ["jobs:schedule:self", "jobs:cancel:self"],
      },
    });
    const respond = vi.fn();

    await cronHandlers["cron.add"]({
      params: {
        name: "forbidden-peer",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "should fail" },
        orchestration: {
          targetAgentId: "worker-2",
          // Forged caller payload should be ignored in favor of authenticated principal.
          caller: { agentId: "super-1", role: "supervisor" },
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
          targetTenantId: "tenant-b",
          targetAgentId: "worker-1",
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
    const { context, cancelWorkflow } = createTemporalContext({
      enterprisePrincipal: {
        tenantId: "tenant-a",
        requesterId: "worker-1",
        role: "worker",
        scopes: ["jobs:schedule:self", "jobs:cancel:self"],
      },
    });
    const respond = vi.fn();

    await cronHandlers["cron.remove"]({
      params: {
        id: "job-1",
        orchestration: {
          targetAgentId: "worker-1",
          caller: { agentId: "super-1", role: "supervisor" },
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

  it("rejects scheduling when authenticated principal is missing", async () => {
    const { context } = createTemporalContext({ enterprisePrincipal: undefined });
    const respond = vi.fn();
    await cronHandlers["cron.add"]({
      params: {
        name: "missing-principal",
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        payload: { kind: "agentTurn", message: "should fail" },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "9", method: "cron.add" },
      isWebchatConnect: () => false,
    });
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it("records callback and emits chat final when sessionKey is provided", async () => {
    const { context, recordWorkflowCallback, broadcast, nodeSendToSession } = createTemporalContext();
    const respond = vi.fn();
    const timestamp = Date.now();
    const completedAt = timestamp;
    const nonce = "nonce-1";
    const signature = signCallback({
      tenantId: "tenant-a",
      agentId: "worker-1",
      jobId: "job-1",
      correlationId: "corr-1",
      status: "succeeded",
      completedAt,
      timestamp,
      nonce,
      secret: process.env.OPENCLAW_TEMPORAL_CALLBACK_SECRET ?? "",
    });

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-1",
        status: "succeeded",
        timestamp: String(timestamp),
        nonce,
        signature,
        completedAt,
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
    const timestamp = Date.now();
    const completedAt = timestamp;
    const nonce = "nonce-2";
    const signature = signCallback({
      tenantId: "tenant-a",
      agentId: "worker-1",
      jobId: "job-1",
      correlationId: "corr-fail",
      status: "failed",
      completedAt,
      timestamp,
      nonce,
      secret: process.env.OPENCLAW_TEMPORAL_CALLBACK_SECRET ?? "",
    });

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-fail",
        status: "failed",
        timestamp: String(timestamp),
        nonce,
        signature,
        completedAt,
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

  it("rejects callback with invalid signature", async () => {
    const { context, recordWorkflowCallback } = createTemporalContext();
    const respond = vi.fn();
    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-invalid",
        status: "failed",
        timestamp: String(Date.now()),
        nonce: "nonce-invalid",
        signature: "bad-signature",
        completedAt: Date.now(),
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "10", method: "cron.callback" },
      isWebchatConnect: () => false,
    });
    expect(recordWorkflowCallback).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("rejects callback nonce replay", async () => {
    const { context } = createTemporalContext();
    const respondFirst = vi.fn();
    const respondSecond = vi.fn();
    const timestamp = Date.now();
    const completedAt = timestamp;
    const nonce = "nonce-replay";
    const signature = signCallback({
      tenantId: "tenant-a",
      agentId: "worker-1",
      jobId: "job-1",
      correlationId: "corr-replay",
      status: "failed",
      completedAt,
      timestamp,
      nonce,
      secret: process.env.OPENCLAW_TEMPORAL_CALLBACK_SECRET ?? "",
    });

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-replay",
        status: "failed",
        timestamp: String(timestamp),
        nonce,
        signature,
        completedAt,
      },
      respond: respondFirst,
      context,
      client: null,
      req: { type: "req", id: "11", method: "cron.callback" },
      isWebchatConnect: () => false,
    });

    await cronHandlers["cron.callback"]({
      params: {
        tenantId: "tenant-a",
        agentId: "worker-1",
        jobId: "job-1",
        correlationId: "corr-replay-2",
        status: "failed",
        timestamp: String(timestamp),
        nonce,
        signature: signCallback({
          tenantId: "tenant-a",
          agentId: "worker-1",
          jobId: "job-1",
          correlationId: "corr-replay-2",
          status: "failed",
          completedAt,
          timestamp,
          nonce,
          secret: process.env.OPENCLAW_TEMPORAL_CALLBACK_SECRET ?? "",
        }),
        completedAt,
      },
      respond: respondSecond,
      context,
      client: null,
      req: { type: "req", id: "12", method: "cron.callback" },
      isWebchatConnect: () => false,
    });

    expect(respondFirst).toHaveBeenCalledWith(true, { ok: true, accepted: true }, undefined);
    expect(respondSecond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
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
