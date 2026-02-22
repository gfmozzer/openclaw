import type { ExecutionDecision } from "./execution-routing.js";
import type { EnterprisePrincipalRef } from "./request-context-contract.js";

export type DelegationEnvelope = {
  taskId: string;
  taskType: string;
  targetWorkerAgentId: string;
  delegatedBy: EnterprisePrincipalRef;
  originalRequester: EnterprisePrincipalRef;
  effectiveScopes: string[];
  effectiveSkillAllowlist?: string[];
  executionDecision: ExecutionDecision;
  payload: Record<string, unknown>;
  trace: {
    requestId?: string;
    sessionKey?: string;
    correlationId?: string;
  };
};

