import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cronHandlers } from "./cron.js";
import type { GatewayRequestContext } from "./types.js";
import { InMemorySchedulerOrchestrator } from "../stateless/adapters/in-memory/in-memory-scheduler-orchestrator.js";

// Minimal valid CronJob stored inside workflow payload
const BASE_CRON_JOB = {
  id: "job-1",
  agentId: "super-1",
  sessionKey: "super-1/default",
  name: "test-job",
  enabled: true,
  deleteAfterRun: false,
  createdAtMs: 1000,
  updatedAtMs: 1000,
  schedule: { kind: "every" as const, everyMs: 60_000 },
  sessionTarget: "isolated" as const,
  wakeMode: "next-heartbeat" as const,
  payload: { kind: "agentTurn" as const, message: "hello" },
  state: {},
};

function createContext(
  orchestrator: InMemorySchedulerOrchestrator | undefined,
  overrides?: Partial<GatewayRequestContext>,
) {
  return {
    cron: {
      wake: vi.fn(),
      list: vi.fn(),
      status: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      run: vi.fn(),
    },
    cronStorePath: "/tmp/cron-test.json",
    schedulerOrchestrator: orchestrator,
    broadcast: vi.fn(),
    nodeSendToSession: vi.fn(),
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
      scopes: ["jobs:schedule:self", "jobs:cancel:self"],
    },
    ...overrides,
  } as unknown as GatewayRequestContext;
}

async function callHandler(
  method: keyof typeof cronHandlers,
  params: unknown,
  context: GatewayRequestContext,
) {
  const respond = vi.fn();
  await (cronHandlers[method] as Function)({
    params,
    respond,
    context,
    client: null,
    req: { type: "req", id: "1", method },
    isWebchatConnect: () => false,
  });
  return respond;
}

describe("cron handlers – temporal CRUD operations", () => {
  beforeEach(() => {
    process.env.OPENCLAW_CRON_ORCHESTRATION_MODE = "temporal";
    delete process.env.OPENCLAW_TEMPORAL_TEAM_MAP_JSON;
  });

  afterEach(() => {
    delete process.env.OPENCLAW_CRON_ORCHESTRATION_MODE;
  });

  // ---------------------------------------------------------------------------
  describe("cron.status", () => {
    it("returns scheduler status from in-memory orchestrator", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.status", {}, context);
      expect(respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          enabled: true,
          jobs: 0,
          orchestrationMode: "in-memory",
        }),
        undefined,
      );
    });

    it("reports active count after registering workflows", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.status", {}, context);
      expect(respond).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ jobs: 1 }),
        undefined,
      );
    });

    it("returns UNAVAILABLE when schedulerOrchestrator is not configured", async () => {
      const context = createContext(undefined);
      const respond = await callHandler("cron.status", {}, context);
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({ code: "UNAVAILABLE" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe("cron.list", () => {
    it("returns empty jobs when no workflows are registered", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.list", {}, context);
      expect(respond).toHaveBeenCalledWith(true, { jobs: [] }, undefined);
    });

    it("returns jobs extracted from registered workflow payloads", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.list", {}, context);
      expect(respond).toHaveBeenCalledWith(true, { jobs: [BASE_CRON_JOB] }, undefined);
    });

    it("excludes workflows whose payload has no cronJob field", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-orphan" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { scheduler: { policyVersion: "v1" } },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.list", {}, context);
      expect(respond).toHaveBeenCalledWith(true, { jobs: [] }, undefined);
    });

    it("scopes list to the requesting principal tenant and agentId", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      // Register job for tenant-a/super-1 and for tenant-b/other
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-mine" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-b", agentId: "other", jobId: "job-other" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: { ...BASE_CRON_JOB, id: "job-other" } },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.list", {}, context);
      const [, result] = respond.mock.calls[0] as [boolean, { jobs: unknown[] }];
      expect(result.jobs).toHaveLength(1);
    });

    it("returns INVALID_REQUEST when enterprisePrincipal is missing", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator, { enterprisePrincipal: undefined });
      const respond = await callHandler("cron.list", {}, context);
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({ code: "INVALID_REQUEST" }),
      );
    });

    it("returns UNAVAILABLE when schedulerOrchestrator is not configured", async () => {
      const context = createContext(undefined);
      const respond = await callHandler("cron.list", {}, context);
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({ code: "UNAVAILABLE" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe("cron.update", () => {
    it("updates schedule and returns the job from workflow payload", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler(
        "cron.update",
        { id: "job-1", patch: { schedule: { kind: "every", everyMs: 120_000 } } },
        context,
      );
      expect(respond).toHaveBeenCalledWith(true, BASE_CRON_JOB, undefined);
    });

    it("enables/disables workflow via patch.enabled", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler(
        "cron.update",
        { id: "job-1", patch: { enabled: false } },
        context,
      );
      expect(respond.mock.calls[0][0]).toBe(true);
      // Workflow status should now be cancelled in the orchestrator
      const wf = await orchestrator.getWorkflow({
        tenantId: "tenant-a",
        agentId: "super-1",
        jobId: "job-1",
      });
      expect(wf?.status).toBe("cancelled");
    });

    it("returns INVALID_REQUEST when workflow is not found", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator);
      const respond = await callHandler(
        "cron.update",
        { id: "nonexistent", patch: { enabled: false } },
        context,
      );
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({ code: "INVALID_REQUEST" }),
      );
    });

  });

  // ---------------------------------------------------------------------------
  describe("cron.run", () => {
    it("triggers a registered workflow and returns ok", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.run", { id: "job-1" }, context);
      expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
    });

    it("returns UNAVAILABLE when workflow is not found", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.run", { id: "nonexistent" }, context);
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({ code: "UNAVAILABLE" }),
      );
    });

  });

  // ---------------------------------------------------------------------------
  describe("cron.runs", () => {
    it("returns empty entries when no executions exist for the job", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.runs", { id: "job-1" }, context);
      expect(respond).toHaveBeenCalledWith(true, { entries: [] }, undefined);
    });

    it("returns execution entries after workflow is triggered", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      // Trigger once directly via orchestrator to seed execution history
      await orchestrator.triggerWorkflow({
        tenantId: "tenant-a",
        agentId: "super-1",
        jobId: "job-1",
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.runs", { id: "job-1" }, context);
      expect(respond).toHaveBeenCalledWith(
        true,
        {
          entries: [
            expect.objectContaining({
              jobId: "job-1",
              status: "ok",
            }),
          ],
        },
        undefined,
      );
    });

    it("maps execution status 'succeeded' to entry status 'ok'", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      await orchestrator.triggerWorkflow({
        tenantId: "tenant-a",
        agentId: "super-1",
        jobId: "job-1",
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.runs", { id: "job-1" }, context);
      const [, result] = respond.mock.calls[0] as [boolean, { entries: { status: string }[] }];
      expect(result.entries[0]?.status).toBe("ok");
    });

    it("maps non-succeeded execution status to entry status 'error'", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      await orchestrator.registerWorkflow({
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        workflowKind: "passive_trigger",
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { cronJob: BASE_CRON_JOB },
      });
      // Simulate a failed execution via callback
      await orchestrator.recordWorkflowCallback({
        correlationId: "corr-fail-1",
        scope: { tenantId: "tenant-a", agentId: "super-1", jobId: "job-1" },
        status: "failed",
        error: { message: "timed out" },
        completedAt: Date.now(),
      });
      const context = createContext(orchestrator);
      const respond = await callHandler("cron.runs", { id: "job-1" }, context);
      const [, result] = respond.mock.calls[0] as [boolean, { entries: { status: string }[] }];
      expect(result.entries[0]?.status).toBe("error");
    });

    it("returns INVALID_REQUEST when jobId is missing", async () => {
      const orchestrator = new InMemorySchedulerOrchestrator();
      const context = createContext(orchestrator);
      // params with neither id nor jobId — handler checks after validation
      const respond = await callHandler("cron.runs", { limit: 10 }, context);
      expect(respond.mock.calls[0][0]).toBe(false);
    });
  });
});
