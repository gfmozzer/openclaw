import { randomUUID } from "node:crypto";
import { normalizeCronJobCreate, normalizeCronJobPatch } from "../../cron/normalize.js";
import { readCronRunLogEntries, resolveCronRunLogPath } from "../../cron/run-log.js";
import type { CronJob, CronJobCreate, CronJobPatch, CronPayload } from "../../cron/types.js";
import { validateScheduleTimestamp } from "../../cron/validate-timestamp.js";
import { resolveCronOrchestrationMode } from "../cron-orchestration-mode.js";
import { incrementEnterpriseMetric } from "../runtime-metrics.js";
import {
  authorizeSchedulerAction,
  resolveSchedulerTeamMapFromEnv,
  type SchedulerAuthorizationInput,
  type SchedulerCallerRole,
} from "../stateless/scheduler-policy.js";
import type { RegisterSchedulerWorkflowRequest } from "../stateless/contracts/scheduler-orchestrator.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateCronAddParams,
  validateCronListParams,
  validateCronRemoveParams,
  validateCronRunParams,
  validateCronRunsParams,
  validateCronStatusParams,
  validateCronUpdateParams,
  validateWakeParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(
  params: Record<string, unknown>,
  key: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `missing or invalid ${key}` };
  }
  return { ok: true, value: value.trim() };
}

function resolveResumeText(params: Record<string, unknown>): string | undefined {
  if (typeof params.resumeText === "string" && params.resumeText.trim()) {
    return params.resumeText.trim();
  }
  const output = params.output;
  if (isRecord(output)) {
    const text = output.text;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }
  return undefined;
}

function temporalWorkflowKindFromPayload(
  payload: CronPayload,
): RegisterSchedulerWorkflowRequest["workflowKind"] {
  if (payload.kind === "systemEvent") {
    return "proactive_followup";
  }
  return payload.deliver ? "report_dispatch" : "passive_trigger";
}

function toTemporalSchedule(schedule: CronJobCreate["schedule"]) {
  if (schedule.kind === "at") {
    return { kind: "at" as const, at: schedule.at };
  }
  if (schedule.kind === "every") {
    return {
      kind: "every" as const,
      everyMs: schedule.everyMs,
      anchorMs: schedule.anchorMs,
    };
  }
  return {
    kind: "cron" as const,
    expr: schedule.expr,
    tz: schedule.tz,
    staggerMs: schedule.staggerMs,
  };
}

function buildTemporalCronJob(jobId: string, now: number, create: CronJobCreate): CronJob {
  return {
    id: jobId,
    agentId: create.agentId,
    sessionKey: create.sessionKey,
    name: create.name,
    description: create.description,
    enabled: create.enabled ?? true,
    deleteAfterRun: create.deleteAfterRun,
    createdAtMs: now,
    updatedAtMs: now,
    schedule: create.schedule,
    sessionTarget: create.sessionTarget,
    wakeMode: create.wakeMode,
    payload: create.payload,
    delivery: create.delivery,
    state: create.state ?? {},
  };
}

type TemporalOrchestrationParams = {
  tenantId?: string;
  targetTenantId?: string;
  targetAgentId?: string;
  idempotencyKey?: string;
  caller?: {
    agentId?: string;
    role?: SchedulerCallerRole;
  };
};

function readTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveTemporalSchedulingIdentity(params: {
  orchestration?: TemporalOrchestrationParams;
  jobAgentId?: string;
}): SchedulerAuthorizationInput & {
  idempotencyKey?: string;
} {
  const tenantId = readTrimmed(params.orchestration?.tenantId) ?? "default";
  const targetTenantId = readTrimmed(params.orchestration?.targetTenantId) ?? tenantId;
  const callerAgentId =
    readTrimmed(params.orchestration?.caller?.agentId) ??
    readTrimmed(params.jobAgentId) ??
    "default";
  const callerRole = params.orchestration?.caller?.role ?? "supervisor";
  const targetAgentId =
    readTrimmed(params.orchestration?.targetAgentId) ??
    readTrimmed(params.jobAgentId) ??
    callerAgentId;
  const idempotencyKey = readTrimmed(params.orchestration?.idempotencyKey);
  return {
    tenantId,
    targetTenantId,
    callerAgentId,
    callerRole,
    targetAgentId,
    idempotencyKey,
  };
}

export const cronHandlers: GatewayRequestHandlers = {
  wake: ({ params, respond, context }) => {
    if (!validateWakeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid wake params: ${formatValidationErrors(validateWakeParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      mode: "now" | "next-heartbeat";
      text: string;
    };
    const result = context.cron.wake({ mode: p.mode, text: p.text });
    respond(true, result, undefined);
  },
  "cron.list": async ({ params, respond, context }) => {
    if (!validateCronListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.list params: ${formatValidationErrors(validateCronListParams.errors)}`,
        ),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "cron.list is not available in temporal mode yet; query Temporal workflows instead.",
        ),
      );
      return;
    }
    const p = params as { includeDisabled?: boolean };
    const jobs = await context.cron.list({
      includeDisabled: p.includeDisabled,
    });
    respond(true, { jobs }, undefined);
  },
  "cron.status": async ({ params, respond, context }) => {
    if (!validateCronStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.status params: ${formatValidationErrors(validateCronStatusParams.errors)}`,
        ),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      respond(
        true,
        {
          enabled: true,
          storePath: "temporal://workflow-registry",
          jobs: 0,
          nextWakeAtMs: null,
          orchestrationMode: "temporal",
        },
        undefined,
      );
      return;
    }
    const status = await context.cron.status();
    respond(true, status, undefined);
  },
  "cron.add": async ({ params, respond, context }) => {
    const normalized = normalizeCronJobCreate(params) ?? params;
    if (!validateCronAddParams(normalized)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.add params: ${formatValidationErrors(validateCronAddParams.errors)}`,
        ),
      );
      return;
    }
    const jobCreate = normalized as unknown as CronJobCreate;
    const timestampValidation = validateScheduleTimestamp(jobCreate.schedule);
    if (!timestampValidation.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, timestampValidation.message),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      incrementEnterpriseMetric("schedule_requests_total");
      if (!context.schedulerOrchestrator) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            "scheduler orchestrator not configured for temporal mode",
          ),
        );
        return;
      }
      const identity = resolveTemporalSchedulingIdentity({
        orchestration: (jobCreate as { orchestration?: TemporalOrchestrationParams })
          .orchestration,
        jobAgentId: jobCreate.agentId ?? undefined,
      });
      const auth = authorizeSchedulerAction({
        input: identity,
        teams: resolveSchedulerTeamMapFromEnv(),
      });
      if (!auth.ok) {
        incrementEnterpriseMetric("schedule_denied_total");
        context.logGateway.warn(
          `scheduler deny action=add tenant=${identity.tenantId} targetTenant=${identity.targetTenantId} caller=${identity.callerAgentId} target=${identity.targetAgentId} reason=${auth.code}`,
        );
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.FORBIDDEN, auth.message, {
            details: {
              reason: auth.code,
              tenantId: identity.tenantId,
              targetTenantId: identity.targetTenantId,
              callerAgentId: identity.callerAgentId,
              callerRole: identity.callerRole,
              targetAgentId: identity.targetAgentId,
            },
          }),
        );
        return;
      }
      const now = Date.now();
      const jobId = randomUUID();
      const job = buildTemporalCronJob(jobId, now, jobCreate);
      await context.schedulerOrchestrator.registerWorkflow({
        scope: {
          tenantId: identity.targetTenantId,
          agentId: identity.targetAgentId,
          jobId,
        },
        workflowKind: temporalWorkflowKindFromPayload(job.payload),
        schedule: toTemporalSchedule(job.schedule),
        payload: {
          scheduler: {
            policyVersion: "v1",
            tenantId: identity.tenantId,
            targetTenantId: identity.targetTenantId,
            callerAgentId: identity.callerAgentId,
            callerRole: identity.callerRole,
            targetAgentId: identity.targetAgentId,
            requestedAt: now,
          },
          cronJob: job,
        },
        dedupeKey: identity.idempotencyKey
          ? `${identity.targetTenantId}:${identity.callerAgentId}:${identity.targetAgentId}:${identity.idempotencyKey}`
          : `${identity.targetTenantId}:${identity.targetAgentId}:${job.name}:${job.schedule.kind}:${jobId}`,
      });
      context.logGateway.info(
        `scheduler add accepted tenant=${identity.tenantId} targetTenant=${identity.targetTenantId} caller=${identity.callerAgentId} target=${identity.targetAgentId} job=${jobId}`,
      );
      respond(true, job, undefined);
      return;
    }
    const job = await context.cron.add(jobCreate);
    respond(true, job, undefined);
  },
  "cron.update": async ({ params, respond, context }) => {
    const normalizedPatch = normalizeCronJobPatch((params as { patch?: unknown } | null)?.patch);
    const candidate =
      normalizedPatch && typeof params === "object" && params !== null
        ? { ...params, patch: normalizedPatch }
        : params;
    if (!validateCronUpdateParams(candidate)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.update params: ${formatValidationErrors(validateCronUpdateParams.errors)}`,
        ),
      );
      return;
    }
    const p = candidate as {
      id?: string;
      jobId?: string;
      patch: Record<string, unknown>;
    };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.update params: missing id"),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "cron.update is not available in temporal mode yet; replace by remove + add.",
        ),
      );
      return;
    }
    const patch = p.patch as unknown as CronJobPatch;
    if (patch.schedule) {
      const timestampValidation = validateScheduleTimestamp(patch.schedule);
      if (!timestampValidation.ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, timestampValidation.message),
        );
        return;
      }
    }
    const job = await context.cron.update(jobId, patch);
    respond(true, job, undefined);
  },
  "cron.remove": async ({ params, respond, context }) => {
    if (!validateCronRemoveParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.remove params: ${formatValidationErrors(validateCronRemoveParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { id?: string; jobId?: string };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.remove params: missing id"),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      if (!context.schedulerOrchestrator) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            "scheduler orchestrator not configured for temporal mode",
          ),
        );
        return;
      }
      const identity = resolveTemporalSchedulingIdentity({
        orchestration: (p as { orchestration?: TemporalOrchestrationParams }).orchestration,
      });
      const auth = authorizeSchedulerAction({
        input: identity,
        teams: resolveSchedulerTeamMapFromEnv(),
      });
      if (!auth.ok) {
        incrementEnterpriseMetric("schedule_denied_total");
        context.logGateway.warn(
          `scheduler deny action=remove tenant=${identity.tenantId} targetTenant=${identity.targetTenantId} caller=${identity.callerAgentId} target=${identity.targetAgentId} reason=${auth.code}`,
        );
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.FORBIDDEN, auth.message, {
            details: {
              reason: auth.code,
              tenantId: identity.tenantId,
              targetTenantId: identity.targetTenantId,
              callerAgentId: identity.callerAgentId,
              callerRole: identity.callerRole,
              targetAgentId: identity.targetAgentId,
            },
          }),
        );
        return;
      }
      const removed = await context.schedulerOrchestrator.cancelWorkflow({
        tenantId: identity.targetTenantId,
        agentId: identity.targetAgentId,
        jobId,
      });
      context.logGateway.info(
        `scheduler remove accepted tenant=${identity.tenantId} targetTenant=${identity.targetTenantId} caller=${identity.callerAgentId} target=${identity.targetAgentId} job=${jobId} removed=${String(removed)}`,
      );
      respond(true, { ok: true, removed }, undefined);
      return;
    }
    const result = await context.cron.remove(jobId);
    respond(true, result, undefined);
  },
  "cron.run": async ({ params, respond, context }) => {
    if (!validateCronRunParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.run params: ${formatValidationErrors(validateCronRunParams.errors)}`,
        ),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "cron.run is not available in temporal mode; trigger via Temporal CLI/UI.",
        ),
      );
      return;
    }
    const p = params as { id?: string; jobId?: string; mode?: "due" | "force" };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.run params: missing id"),
      );
      return;
    }
    const result = await context.cron.run(jobId, p.mode ?? "force");
    respond(true, result, undefined);
  },
  "cron.runs": async ({ params, respond, context }) => {
    if (!validateCronRunsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid cron.runs params: ${formatValidationErrors(validateCronRunsParams.errors)}`,
        ),
      );
      return;
    }
    if (resolveCronOrchestrationMode() === "temporal") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "cron.runs is not available in temporal mode yet; inspect run history in Temporal.",
        ),
      );
      return;
    }
    const p = params as { id?: string; jobId?: string; limit?: number };
    const jobId = p.id ?? p.jobId;
    if (!jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid cron.runs params: missing id"),
      );
      return;
    }
    const logPath = resolveCronRunLogPath({
      storePath: context.cronStorePath,
      jobId,
    });
    const entries = await readCronRunLogEntries(logPath, {
      limit: p.limit,
      jobId,
    });
    respond(true, { entries }, undefined);
  },
  "cron.callback": async ({ params, respond, context }) => {
    if (!context.schedulerOrchestrator) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "scheduler orchestrator is not configured"),
      );
      return;
    }
    if (!isRecord(params)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid callback params"));
      return;
    }
    const tenantId = readRequiredString(params, "tenantId");
    const agentId = readRequiredString(params, "agentId");
    const jobId = readRequiredString(params, "jobId");
    const correlationId = readRequiredString(params, "correlationId");
    const status = readRequiredString(params, "status");
    if (!tenantId.ok || !agentId.ok || !jobId.ok || !correlationId.ok || !status.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          [tenantId, agentId, jobId, correlationId, status]
            .filter((entry) => !entry.ok)
            .map((entry) => entry.error)
            .join("; "),
        ),
      );
      return;
    }
    if (!["succeeded", "failed", "timed_out", "cancelled"].includes(status.value)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid status (expected: succeeded|failed|timed_out|cancelled)",
        ),
      );
      return;
    }
    const output = isRecord(params.output) ? params.output : undefined;
    const errorData = isRecord(params.error)
      ? {
          code: typeof params.error.code === "string" ? params.error.code : undefined,
          message: typeof params.error.message === "string" ? params.error.message : "unknown error",
          retryable: typeof params.error.retryable === "boolean" ? params.error.retryable : undefined,
        }
      : undefined;
    const accepted = await context.schedulerOrchestrator.recordWorkflowCallback({
      correlationId: correlationId.value,
      scope: {
        tenantId: tenantId.value,
        agentId: agentId.value,
        jobId: jobId.value,
      },
      workflowId: typeof params.workflowId === "string" ? params.workflowId : undefined,
      runId: typeof params.runId === "string" ? params.runId : undefined,
      status: status.value as "succeeded" | "failed" | "timed_out" | "cancelled",
      output,
      error: errorData,
      completedAt: typeof params.completedAt === "number" ? params.completedAt : Date.now(),
    });
    const sessionKey =
      typeof params.sessionKey === "string" && params.sessionKey.trim()
        ? params.sessionKey.trim()
        : undefined;
    const resumeText = resolveResumeText(params);
    if (accepted && sessionKey && resumeText) {
      incrementEnterpriseMetric("chat_async_resume_total");
      const chatPayload = {
        runId: `resume-${correlationId.value}`,
        sessionKey,
        seq: 0,
        state: "final" as const,
        message: {
          role: "assistant",
          content: [{ type: "text", text: resumeText }],
          timestamp: Date.now(),
          stopReason: "stop",
          usage: { input: 0, output: 0, totalTokens: 0 },
        },
      };
      context.broadcast("chat", chatPayload);
      context.nodeSendToSession(sessionKey, "chat", chatPayload);
      context.logGateway.info(
        `scheduler callback resume delivered correlationId=${correlationId.value} tenant=${tenantId.value} agent=${agentId.value} job=${jobId.value} sessionKey=${sessionKey}`,
      );
    } else if (!accepted) {
      incrementEnterpriseMetric("workflow_resume_failures_total");
      incrementEnterpriseMetric("chat_async_resume_failures_total");
      context.logGateway.warn(
        `scheduler callback rejected correlationId=${correlationId.value} tenant=${tenantId.value} agent=${agentId.value} job=${jobId.value}`,
      );
    }
    respond(true, { ok: true, accepted }, undefined);
  },
  "cron.resume.pull": async ({ params, respond, context }) => {
    if (!context.schedulerOrchestrator) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "scheduler orchestrator is not configured"),
      );
      return;
    }
    if (!isRecord(params)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid resume.pull params"));
      return;
    }
    const tenantId = readRequiredString(params, "tenantId");
    const agentId = readRequiredString(params, "agentId");
    if (!tenantId.ok || !agentId.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          [tenantId, agentId]
            .filter((entry) => !entry.ok)
            .map((entry) => entry.error)
            .join("; "),
        ),
      );
      return;
    }
    const correlationId =
      typeof params.correlationId === "string" && params.correlationId.trim()
        ? params.correlationId.trim()
        : undefined;
    const signal = await context.schedulerOrchestrator.pullResumeSignal({
      scope: {
        tenantId: tenantId.value,
        agentId: agentId.value,
      },
      correlationId,
    });
    if (!signal && correlationId) {
      incrementEnterpriseMetric("workflow_resume_failures_total");
      incrementEnterpriseMetric("chat_async_resume_failures_total");
      context.logGateway.warn(
        `scheduler resume missing correlationId=${correlationId} tenant=${tenantId.value} agent=${agentId.value}`,
      );
    }
    if (signal) {
      incrementEnterpriseMetric("chat_async_resume_total");
    }
    respond(true, { signal }, undefined);
  },
};
