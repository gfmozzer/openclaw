export type EnterpriseRole = "admin" | "supervisor" | "worker" | "employee";

export type EnterpriseScope =
  | "jobs:schedule:self"
  | "jobs:schedule:team"
  | "jobs:cancel:self"
  | "jobs:cancel:team"
  | "swarm:read"
  | "swarm:write"
  | "skills:invoke"
  | "skills:invoke:finance"
  | "memory:read:self"
  | "memory:read:team";

export const DEFAULT_ROLE_SCOPES: Record<EnterpriseRole, readonly EnterpriseScope[]> = {
  admin: [
    "jobs:schedule:self",
    "jobs:schedule:team",
    "jobs:cancel:self",
    "jobs:cancel:team",
    "swarm:read",
    "swarm:write",
    "skills:invoke",
    "skills:invoke:finance",
    "memory:read:self",
    "memory:read:team",
  ],
  supervisor: [
    "jobs:schedule:self",
    "jobs:schedule:team",
    "jobs:cancel:self",
    "jobs:cancel:team",
    "swarm:read",
    "swarm:write",
    "skills:invoke",
    "memory:read:self",
    "memory:read:team",
  ],
  worker: [
    "jobs:schedule:self",
    "jobs:cancel:self",
    "swarm:read",
    "skills:invoke",
    "memory:read:self",
  ],
  employee: [
    "jobs:schedule:self",
    "jobs:cancel:self",
    "memory:read:self",
    "skills:invoke",
  ],
};

export type EnterpriseIdentity = {
  tenantId: string;
  requesterId: string;
  role: EnterpriseRole;
  scopes: EnterpriseScope[];
};

export type EnterpriseErrorCode =
  | "UNAUTHORIZED_REQUESTER"
  | "FORBIDDEN_SCOPE"
  | "CROSS_TENANT_FORBIDDEN"
  | "WORKFLOW_CONTEXT_MISSING"
  // Plan 2: Delegation and Execution Routing Errors
  | "DELEGATION_DENIED"
  | "WORKER_NOT_IN_TEAM"
  | "WORKER_CANNOT_DELEGATE"
  | "SCHEDULE_TEAM_DENIED"
  | "INSUFFICIENT_SCOPES"
  | "TARGET_ROLE_INVALID"
  | "CROSS_TENANT_DELEGATION_FORBIDDEN"
  | "EXECUTION_MODE_UNAVAILABLE"
  | "WORKER_UNAVAILABLE"
  | "WORKER_NOT_FOUND"
  | "EXECUTION_TIMEOUT"
  | "RATE_LIMITED"
  | "QUEUE_FULL"
  | "WORKFLOW_NOT_FOUND"
  | "INVALID_DELEGATION_CONTEXT"
  | "SKILL_NOT_ALLOWED"
  | "PROVIDER_CONFIG_MISSING"
  | "INTERNAL_ERROR";

export type EnterpriseError = {
  code: EnterpriseErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type AsyncScheduleTarget = {
  tenantId: string;
  agentId: string;
};

export type AsyncScheduleRequest = {
  requestId: string;
  correlationId: string;
  idempotencyKey?: string;
  identity: EnterpriseIdentity;
  target: AsyncScheduleTarget;
  workflowType: string;
  payload: Record<string, unknown>;
  schedule:
    | { kind: "immediate" }
    | { kind: "at"; atEpochMs: number }
    | { kind: "every"; everyMs: number; anchorMs?: number }
    | { kind: "cron"; expr: string; tz?: string; staggerMs?: number };
};

export type AsyncScheduleAccepted = {
  accepted: true;
  workflowId: string;
  runId?: string;
  queuedAtEpochMs: number;
  correlationId: string;
};

export type AsyncWorkflowCallbackRequest = {
  callbackId: string;
  correlationId: string;
  workflowId: string;
  runId?: string;
  tenantId: string;
  targetAgentId: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  completedAtEpochMs: number;
};

export type AsyncWorkflowResumeRequest = {
  correlationId: string;
  workflowId: string;
  tenantId: string;
  targetAgentId: string;
  sessionKey?: string;
  contextSnapshotRef?: string;
};

export type AsyncWorkflowResumeResult = {
  resumed: boolean;
  reason?: "already_resumed" | "context_not_found" | "target_not_available";
};

export type SwarmWorkerMember = {
  agentId: string;
  displayName?: string;
  specialties?: string[];
  allowedScopes?: EnterpriseScope[];
};

export type SwarmTeamDefinition = {
  tenantId: string;
  teamId: string;
  supervisorAgentId: string;
  workers: SwarmWorkerMember[];
  updatedAtEpochMs: number;
};

export type SwarmDirectoryUpsertRequest = {
  identity: EnterpriseIdentity;
  team: SwarmTeamDefinition;
};

export type SwarmDirectoryListRequest = {
  identity: EnterpriseIdentity;
  tenantId: string;
};
