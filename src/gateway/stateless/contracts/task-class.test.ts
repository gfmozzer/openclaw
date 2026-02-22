import { describe, expect, it } from "vitest";
import {
  classifyTask,
  TASK_CLASS_METADATA,
  TASK_CLASS_TO_EXECUTION_MODE,
  type TaskClass,
} from "./task-class.js";

describe("task-class", () => {
  describe("TASK_CLASS_METADATA", () => {
    it("should have metadata for all task classes", () => {
      const classes: TaskClass[] = [
        "inline_sync",
        "ephemeral_async",
        "durable_async",
        "scheduled",
        "human_approval",
      ];
      for (const taskClass of classes) {
        expect(TASK_CLASS_METADATA[taskClass]).toBeDefined();
        expect(TASK_CLASS_METADATA[taskClass].description).toBeTruthy();
        expect(TASK_CLASS_METADATA[taskClass].defaultTimeoutMs).toBeGreaterThan(0);
      }
    });

    it("should have correct persistence requirements", () => {
      expect(TASK_CLASS_METADATA.inline_sync.requiresPersistence).toBe(false);
      expect(TASK_CLASS_METADATA.ephemeral_async.requiresPersistence).toBe(false);
      expect(TASK_CLASS_METADATA.durable_async.requiresPersistence).toBe(true);
      expect(TASK_CLASS_METADATA.scheduled.requiresPersistence).toBe(true);
      expect(TASK_CLASS_METADATA.human_approval.requiresPersistence).toBe(true);
    });

    it("should have correct resume support", () => {
      expect(TASK_CLASS_METADATA.inline_sync.supportsResume).toBe(false);
      expect(TASK_CLASS_METADATA.ephemeral_async.supportsResume).toBe(false);
      expect(TASK_CLASS_METADATA.durable_async.supportsResume).toBe(true);
      expect(TASK_CLASS_METADATA.scheduled.supportsResume).toBe(true);
      expect(TASK_CLASS_METADATA.human_approval.supportsResume).toBe(true);
    });
  });

  describe("TASK_CLASS_TO_EXECUTION_MODE", () => {
    it("should map inline_sync to inline", () => {
      expect(TASK_CLASS_TO_EXECUTION_MODE.inline_sync).toBe("inline");
    });

    it("should map ephemeral_async to redis_ephemeral", () => {
      expect(TASK_CLASS_TO_EXECUTION_MODE.ephemeral_async).toBe("redis_ephemeral");
    });

    it("should map durable_async to temporal_workflow", () => {
      expect(TASK_CLASS_TO_EXECUTION_MODE.durable_async).toBe("temporal_workflow");
    });

    it("should map scheduled to temporal_workflow", () => {
      expect(TASK_CLASS_TO_EXECUTION_MODE.scheduled).toBe("temporal_workflow");
    });

    it("should map human_approval to temporal_workflow", () => {
      expect(TASK_CLASS_TO_EXECUTION_MODE.human_approval).toBe("temporal_workflow");
    });
  });

  describe("classifyTask", () => {
    it("should classify human-in-the-loop as human_approval", () => {
      const result = classifyTask({
        taskType: "test",
        hasHumanInTheLoop: true,
      });
      expect(result.taskClass).toBe("human_approval");
      expect(result.confidence).toBe("high");
    });

    it("should classify delayed schedule as scheduled", () => {
      const result = classifyTask({
        taskType: "test",
        scheduleKind: "delayed",
      });
      expect(result.taskClass).toBe("scheduled");
      expect(result.confidence).toBe("high");
    });

    it("should classify recurring schedule as scheduled", () => {
      const result = classifyTask({
        taskType: "test",
        scheduleKind: "recurring",
      });
      expect(result.taskClass).toBe("scheduled");
      expect(result.confidence).toBe("high");
    });

    it("should classify requiresResume as durable_async", () => {
      const result = classifyTask({
        taskType: "test",
        requiresResume: true,
      });
      expect(result.taskClass).toBe("durable_async");
      expect(result.confidence).toBe("high");
    });

    it("should classify requiresCallback as durable_async", () => {
      const result = classifyTask({
        taskType: "test",
        requiresCallback: true,
      });
      expect(result.taskClass).toBe("durable_async");
      expect(result.confidence).toBe("high");
    });

    it("should classify long duration as durable_async", () => {
      const result = classifyTask({
        taskType: "test",
        estimatedDurationMs: 400000, // > 5 min
      });
      expect(result.taskClass).toBe("durable_async");
      expect(result.confidence).toBe("medium");
    });

    it("should classify medium duration as ephemeral_async", () => {
      const result = classifyTask({
        taskType: "test",
        estimatedDurationMs: 60000, // > 30s, < 5min
      });
      expect(result.taskClass).toBe("ephemeral_async");
      expect(result.confidence).toBe("medium");
    });

    it("should classify short duration as inline_sync by default", () => {
      const result = classifyTask({
        taskType: "test",
        estimatedDurationMs: 10000,
      });
      expect(result.taskClass).toBe("inline_sync");
      expect(result.confidence).toBe("high");
    });

    it("should default to inline_sync when no hints provided", () => {
      const result = classifyTask({
        taskType: "test",
      });
      expect(result.taskClass).toBe("inline_sync");
      expect(result.confidence).toBe("high");
    });
  });
});
