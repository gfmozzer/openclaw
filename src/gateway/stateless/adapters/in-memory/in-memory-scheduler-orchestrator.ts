import type {
  RegisterSchedulerWorkflowRequest,
  SchedulerOrchestrator,
  SchedulerRegistrationResult,
  SchedulerScope,
  SchedulerStatus,
  SchedulerWorkflowCallbackRequest,
  SchedulerWorkflowExecution,
  SchedulerWorkflowPatch,
  SchedulerWorkflowResumeSignal,
  SchedulerWorkflowState,
} from "../../contracts/scheduler-orchestrator.js";

function scopeKey(scope: SchedulerScope): string {
  return `${scope.tenantId}:${scope.agentId}:${scope.jobId}`;
}

export class InMemorySchedulerOrchestrator implements SchedulerOrchestrator {
  private readonly workflows = new Map<string, SchedulerWorkflowState>();
  private readonly resumeSignalsByScope = new Map<string, SchedulerWorkflowResumeSignal[]>();
  private readonly callbackCorrelationIndexByScope = new Map<string, Set<string>>();
  private readonly executionHistory = new Map<string, SchedulerWorkflowExecution[]>();

  async registerWorkflow(
    request: RegisterSchedulerWorkflowRequest,
  ): Promise<SchedulerRegistrationResult> {
    const now = Date.now();
    const workflowId = `${request.scope.tenantId}:${request.scope.agentId}:${request.scope.jobId}`;
    const next: SchedulerWorkflowState = {
      scope: request.scope,
      workflowId,
      runId: undefined,
      workflowKind: request.workflowKind,
      schedule: request.schedule,
      payload: request.payload,
      queue: request.queue,
      dedupeKey: request.dedupeKey,
      status: "registered",
      updatedAt: now,
    };
    this.workflows.set(scopeKey(request.scope), next);
    return {
      workflowId,
      registeredAt: now,
    };
  }

  async cancelWorkflow(scope: SchedulerScope): Promise<boolean> {
    const key = scopeKey(scope);
    const existing = this.workflows.get(key);
    if (!existing) {
      return false;
    }
    this.workflows.set(key, {
      ...existing,
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return true;
  }

  async getWorkflow(scope: SchedulerScope): Promise<SchedulerWorkflowState | null> {
    return this.workflows.get(scopeKey(scope)) ?? null;
  }

  async recordWorkflowCallback(request: SchedulerWorkflowCallbackRequest): Promise<boolean> {
    const key = scopeKey(request.scope);
    const existing = this.workflows.get(key);
    if (!existing) {
      return false;
    }
    if (request.workflowId && request.workflowId !== existing.workflowId) {
      return false;
    }
    if (request.runId && existing.runId && request.runId !== existing.runId) {
      return false;
    }
    const correlationSet = this.callbackCorrelationIndexByScope.get(key) ?? new Set<string>();
    if (correlationSet.has(request.correlationId)) {
      return false;
    }
    correlationSet.add(request.correlationId);
    this.callbackCorrelationIndexByScope.set(key, correlationSet);
    const completedAt = request.completedAt ?? Date.now();
    const newStatus =
      request.status === "succeeded"
        ? "completed" as const
        : request.status === "cancelled"
          ? "cancelled" as const
          : "failed" as const;
    this.workflows.set(key, {
      ...existing,
      status: newStatus,
      runId: request.runId ?? existing.runId,
      workflowId: request.workflowId ?? existing.workflowId,
      updatedAt: completedAt,
    });

    const execution: SchedulerWorkflowExecution = {
      workflowId: request.workflowId ?? existing.workflowId,
      runId: request.runId,
      scope: request.scope,
      status: request.status,
      completedAt,
      output: request.output,
      error: request.error,
    };
    const history = this.executionHistory.get(key) ?? [];
    history.push(execution);
    this.executionHistory.set(key, history);

    const signal: SchedulerWorkflowResumeSignal = {
      correlationId: request.correlationId,
      scope: request.scope,
      workflowId: request.workflowId,
      runId: request.runId,
      status: request.status,
      output: request.output,
      error: request.error,
      completedAt,
    };
    const queueKey = `${request.scope.tenantId}:${request.scope.agentId}`;
    const queue = this.resumeSignalsByScope.get(queueKey) ?? [];
    queue.push(signal);
    this.resumeSignalsByScope.set(queueKey, queue);
    return true;
  }

  async pullResumeSignal(params: {
    scope: Pick<SchedulerScope, "tenantId" | "agentId">;
    correlationId?: string;
  }): Promise<SchedulerWorkflowResumeSignal | null> {
    const queueKey = `${params.scope.tenantId}:${params.scope.agentId}`;
    const queue = this.resumeSignalsByScope.get(queueKey);
    if (!queue || queue.length === 0) {
      return null;
    }
    if (!params.correlationId) {
      const next = queue.shift() ?? null;
      if (queue.length === 0) {
        this.resumeSignalsByScope.delete(queueKey);
      }
      return next;
    }
    const index = queue.findIndex((entry) => entry.correlationId === params.correlationId);
    if (index < 0) {
      return null;
    }
    const [entry] = queue.splice(index, 1);
    if (queue.length === 0) {
      this.resumeSignalsByScope.delete(queueKey);
    }
    return entry ?? null;
  }

  async listWorkflows(params: {
    tenantId: string;
    agentId?: string;
    includeDisabled?: boolean;
  }): Promise<SchedulerWorkflowState[]> {
    const result: SchedulerWorkflowState[] = [];
    for (const workflow of this.workflows.values()) {
      if (workflow.scope.tenantId !== params.tenantId) {
        continue;
      }
      if (params.agentId && workflow.scope.agentId !== params.agentId) {
        continue;
      }
      if (!params.includeDisabled && workflow.status === "cancelled") {
        continue;
      }
      result.push(workflow);
    }
    return result;
  }

  async updateWorkflow(
    scope: SchedulerScope,
    patch: SchedulerWorkflowPatch,
  ): Promise<SchedulerWorkflowState | null> {
    const key = scopeKey(scope);
    const existing = this.workflows.get(key);
    if (!existing) {
      return null;
    }
    const updated: SchedulerWorkflowState = {
      ...existing,
      updatedAt: Date.now(),
    };
    if (patch.schedule !== undefined) {
      updated.schedule = patch.schedule;
    }
    if (patch.payload !== undefined) {
      updated.payload = patch.payload;
    }
    if (patch.workflowKind !== undefined) {
      updated.workflowKind = patch.workflowKind;
    }
    if (patch.queue !== undefined) {
      updated.queue = patch.queue;
    }
    if (patch.enabled === false) {
      updated.status = "cancelled";
    } else if (patch.enabled === true && existing.status === "cancelled") {
      updated.status = "registered";
    }
    this.workflows.set(key, updated);
    return updated;
  }

  async triggerWorkflow(scope: SchedulerScope): Promise<{ ok: boolean; reason?: string }> {
    const key = scopeKey(scope);
    const existing = this.workflows.get(key);
    if (!existing) {
      return { ok: false, reason: "workflow not found" };
    }
    if (existing.status === "cancelled") {
      return { ok: false, reason: "workflow is disabled" };
    }
    this.workflows.set(key, {
      ...existing,
      status: "running",
      updatedAt: Date.now(),
    });
    const execution: SchedulerWorkflowExecution = {
      workflowId: existing.workflowId,
      scope,
      status: "succeeded",
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
    const history = this.executionHistory.get(key) ?? [];
    history.push(execution);
    this.executionHistory.set(key, history);
    this.workflows.set(key, {
      ...existing,
      status: "registered",
      updatedAt: Date.now(),
    });
    return { ok: true };
  }

  async getWorkflowHistory(
    scope: SchedulerScope,
    opts?: { limit?: number },
  ): Promise<SchedulerWorkflowExecution[]> {
    const key = scopeKey(scope);
    const history = this.executionHistory.get(key) ?? [];
    const limit = opts?.limit ?? 50;
    return history.slice(-limit).reverse();
  }

  async getStatus(): Promise<SchedulerStatus> {
    let active = 0;
    for (const workflow of this.workflows.values()) {
      if (workflow.status === "registered" || workflow.status === "running") {
        active++;
      }
    }
    return {
      connected: true,
      activeWorkflows: active,
      orchestrationMode: "in-memory",
    };
  }
}
