import { describe, expect, it } from "vitest";
import { InMemorySchedulerOrchestrator } from "./in-memory-scheduler-orchestrator.js";

describe("InMemorySchedulerOrchestrator callback hardening", () => {
  it("rejects callback for unknown workflow scope", async () => {
    const orchestrator = new InMemorySchedulerOrchestrator();
    const accepted = await orchestrator.recordWorkflowCallback({
      correlationId: "corr-1",
      scope: { tenantId: "tenant-a", agentId: "worker-1", jobId: "job-1" },
      status: "succeeded",
    });
    expect(accepted).toBe(false);
  });

  it("rejects callback when workflowId mismatches registered workflow", async () => {
    const orchestrator = new InMemorySchedulerOrchestrator();
    await orchestrator.registerWorkflow({
      scope: { tenantId: "tenant-a", agentId: "worker-1", jobId: "job-1" },
      workflowKind: "passive_trigger",
      schedule: { kind: "every", everyMs: 60_000 },
      payload: {},
    });
    const accepted = await orchestrator.recordWorkflowCallback({
      correlationId: "corr-2",
      scope: { tenantId: "tenant-a", agentId: "worker-1", jobId: "job-1" },
      workflowId: "other-workflow",
      status: "succeeded",
    });
    expect(accepted).toBe(false);
  });

  it("rejects duplicated callback correlationId for same scope", async () => {
    const orchestrator = new InMemorySchedulerOrchestrator();
    const scope = { tenantId: "tenant-a", agentId: "worker-1", jobId: "job-1" };
    await orchestrator.registerWorkflow({
      scope,
      workflowKind: "passive_trigger",
      schedule: { kind: "every", everyMs: 60_000 },
      payload: {},
    });
    const first = await orchestrator.recordWorkflowCallback({
      correlationId: "corr-3",
      scope,
      status: "succeeded",
    });
    const second = await orchestrator.recordWorkflowCallback({
      correlationId: "corr-3",
      scope,
      status: "succeeded",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
