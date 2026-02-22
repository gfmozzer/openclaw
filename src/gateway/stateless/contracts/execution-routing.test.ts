import { describe, expect, it } from "vitest";
import {
  createDefaultExecutionRoutingPolicy,
  type ExecutionRoutingPolicyInput,
} from "./execution-routing.js";
import type { TaskClass } from "./task-class.js";
import type { RequestSource } from "./request-context-contract.js";

describe("execution-routing", () => {
  describe("createDefaultExecutionRoutingPolicy", () => {
    it("should decide inline for inline_sync task class", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "inline_sync" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 30000,
        isIdempotent: true,
        canRetry: false,
        requiresResume: false,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("inline");
      expect(result.reason).toContain("inline_sync");
    });

    it("should decide redis_ephemeral for ephemeral_async task class", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "ephemeral_async" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 300000,
        isIdempotent: true,
        canRetry: true,
        requiresResume: false,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("redis_ephemeral");
      expect(result.queue).toBe("ephemeral:tenant-1");
    });

    it("should decide temporal_workflow for durable_async task class", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "generate-report",
        taskClass: "durable_async" as TaskClass,
        requestSource: "trusted_frontdoor_api" as RequestSource,
        timeoutBudgetMs: 3600000,
        isIdempotent: true,
        canRetry: true,
        requiresResume: true,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("temporal_workflow");
      expect(result.workflowType).toBe("generate-report");
    });

    it("should decide temporal_workflow for scheduled task class", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "cron-job",
        taskClass: "scheduled" as TaskClass,
        requestSource: "system_job" as RequestSource,
        timeoutBudgetMs: 3600000,
        isIdempotent: true,
        canRetry: true,
        requiresResume: true,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("temporal_workflow");
    });

    it("should use forced execution mode when tenant provides force override", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "inline_sync" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 30000,
        isIdempotent: true,
        canRetry: false,
        requiresResume: false,
        tenantId: "tenant-1",
        tenantPolicyHints: {
          forceExecutionMode: "temporal_workflow",
        },
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("temporal_workflow");
      expect(result.reason).toContain("Forced by tenant policy");
    });

    it("should fallback when preferred mode is unavailable", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "temporal_workflow"]); // redis_ephemeral not available

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "ephemeral_async" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 300000,
        isIdempotent: true,
        canRetry: true,
        requiresResume: false,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("temporal_workflow");
      expect(result.reason).toContain("Fallback");
    });

    it("should emergency fallback to inline when all preferred modes unavailable", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline"]); // only inline available

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "durable_async" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 3600000,
        isIdempotent: true,
        canRetry: true,
        requiresResume: true,
        tenantId: "tenant-1",
      };

      const result = policy.decide(input);
      expect(result.mode).toBe("inline");
      expect(result.reason).toContain("Emergency fallback");
    });
  });

  describe("isModeAvailable", () => {
    it("should return true for available modes", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral"]);
      expect(policy.isModeAvailable("inline")).toBe(true);
      expect(policy.isModeAvailable("redis_ephemeral")).toBe(true);
    });

    it("should return false for unavailable modes", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline"]);
      expect(policy.isModeAvailable("redis_ephemeral")).toBe(false);
      expect(policy.isModeAvailable("temporal_workflow")).toBe(false);
    });
  });

  describe("fallbackDecision", () => {
    it("should fallback to more robust modes", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "redis_ephemeral", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "inline_sync" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 30000,
        isIdempotent: true,
        canRetry: false,
        requiresResume: false,
        tenantId: "tenant-1",
      };

      const result = policy.fallbackDecision("inline", input);
      expect(result.mode).toBe("redis_ephemeral");
    });

    it("should fallback to temporal when redis is unavailable", () => {
      const policy = createDefaultExecutionRoutingPolicy(["inline", "temporal_workflow"]);

      const input: ExecutionRoutingPolicyInput = {
        taskType: "test",
        taskClass: "inline_sync" as TaskClass,
        requestSource: "channel_direct" as RequestSource,
        timeoutBudgetMs: 30000,
        isIdempotent: true,
        canRetry: false,
        requiresResume: false,
        tenantId: "tenant-1",
      };

      const result = policy.fallbackDecision("redis_ephemeral", input);
      expect(result.mode).toBe("temporal_workflow");
    });
  });
});
