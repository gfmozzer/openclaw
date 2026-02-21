export type SchedulerScope = {
  tenantId: string;
  agentId: string;
  jobId: string;
};

export type SchedulerWorkflowKind = "report_dispatch" | "passive_trigger" | "proactive_followup";

export type SchedulerSchedule =
  | {
      kind: "at";
      at: string;
    }
  | {
      kind: "every";
      everyMs: number;
      anchorMs?: number;
    }
  | {
      kind: "cron";
      expr: string;
      tz?: string;
      staggerMs?: number;
    };

export type RegisterSchedulerWorkflowRequest = {
  scope: SchedulerScope;
  workflowKind: SchedulerWorkflowKind;
  schedule: SchedulerSchedule;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  queue?: string;
};

export type SchedulerRegistrationResult = {
  workflowId: string;
  runId?: string;
  registeredAt: number;
};

export type SchedulerWorkflowState = {
  scope: SchedulerScope;
  workflowId: string;
  runId?: string;
  workflowKind: SchedulerWorkflowKind;
  schedule: SchedulerSchedule;
  payload: Record<string, unknown>;
  queue?: string;
  dedupeKey?: string;
  status: "registered" | "running" | "completed" | "failed" | "cancelled";
  updatedAt: number;
};

export type SchedulerCallbackStatus = "succeeded" | "failed" | "timed_out" | "cancelled";

export type SchedulerWorkflowCallbackRequest = {
  correlationId: string;
  scope: SchedulerScope;
  workflowId?: string;
  runId?: string;
  status: SchedulerCallbackStatus;
  output?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
  completedAt?: number;
};

export type SchedulerWorkflowResumeSignal = {
  correlationId: string;
  scope: SchedulerScope;
  workflowId?: string;
  runId?: string;
  status: SchedulerCallbackStatus;
  output?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
  completedAt: number;
};

export interface SchedulerOrchestrator {
  registerWorkflow(
    request: RegisterSchedulerWorkflowRequest,
  ): Promise<SchedulerRegistrationResult>;
  cancelWorkflow(scope: SchedulerScope): Promise<boolean>;
  getWorkflow(scope: SchedulerScope): Promise<SchedulerWorkflowState | null>;
  recordWorkflowCallback(request: SchedulerWorkflowCallbackRequest): Promise<boolean>;
  pullResumeSignal(params: {
    scope: Pick<SchedulerScope, "tenantId" | "agentId">;
    correlationId?: string;
  }): Promise<SchedulerWorkflowResumeSignal | null>;
}
