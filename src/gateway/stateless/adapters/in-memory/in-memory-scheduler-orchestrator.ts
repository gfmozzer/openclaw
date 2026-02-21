import type {
  RegisterSchedulerWorkflowRequest,
  SchedulerOrchestrator,
  SchedulerRegistrationResult,
  SchedulerScope,
  SchedulerWorkflowCallbackRequest,
  SchedulerWorkflowResumeSignal,
  SchedulerWorkflowState,
} from "../../contracts/scheduler-orchestrator.js";

function scopeKey(scope: SchedulerScope): string {
  return `${scope.tenantId}:${scope.agentId}:${scope.jobId}`;
}

export class InMemorySchedulerOrchestrator implements SchedulerOrchestrator {
  private readonly workflows = new Map<string, SchedulerWorkflowState>();
  private readonly resumeSignalsByScope = new Map<string, SchedulerWorkflowResumeSignal[]>();

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
    if (existing) {
      this.workflows.set(key, {
        ...existing,
        status:
          request.status === "succeeded"
            ? "completed"
            : request.status === "cancelled"
              ? "cancelled"
              : "failed",
        runId: request.runId ?? existing.runId,
        workflowId: request.workflowId ?? existing.workflowId,
        updatedAt: request.completedAt ?? Date.now(),
      });
    }

    const signal: SchedulerWorkflowResumeSignal = {
      correlationId: request.correlationId,
      scope: request.scope,
      workflowId: request.workflowId,
      runId: request.runId,
      status: request.status,
      output: request.output,
      error: request.error,
      completedAt: request.completedAt ?? Date.now(),
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
}
