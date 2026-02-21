import type {
  RegisterSchedulerWorkflowRequest,
  SchedulerOrchestrator,
  SchedulerRegistrationResult,
  SchedulerScope,
  SchedulerWorkflowCallbackRequest,
  SchedulerWorkflowResumeSignal,
  SchedulerWorkflowState,
} from "../../contracts/scheduler-orchestrator.js";

type TemporalOrchestratorConfig = {
  endpoint: string;
  authToken?: string;
  timeoutMs: number;
};

function readTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeEndpoint(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveTemporalOrchestratorConfig(
  env: NodeJS.ProcessEnv = process.env,
): TemporalOrchestratorConfig | null {
  const endpoint = normalizeEndpoint(env.OPENCLAW_TEMPORAL_ORCHESTRATOR_ENDPOINT);
  if (!endpoint) {
    return null;
  }
  const timeoutRaw = Number(env.OPENCLAW_TEMPORAL_ORCHESTRATOR_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 15_000;
  return {
    endpoint,
    authToken: readTrimmed(env.OPENCLAW_TEMPORAL_ORCHESTRATOR_AUTH_TOKEN),
    timeoutMs,
  };
}

export class TemporalSchedulerOrchestrator implements SchedulerOrchestrator {
  constructor(private readonly config: TemporalOrchestratorConfig) {}

  async registerWorkflow(
    request: RegisterSchedulerWorkflowRequest,
  ): Promise<SchedulerRegistrationResult> {
    const result = await this.request<{
      workflowId?: string;
      runId?: string;
      registeredAt?: number;
    }>("/register", {
      request,
    });
    const registeredAt = Number.isFinite(result?.registeredAt) ? Number(result.registeredAt) : Date.now();
    return {
      workflowId: result?.workflowId || `${request.scope.tenantId}:${request.scope.agentId}:${request.scope.jobId}`,
      runId: result?.runId,
      registeredAt,
    };
  }

  async cancelWorkflow(scope: SchedulerScope): Promise<boolean> {
    const result = await this.request<{ removed?: boolean }>("/cancel", { scope });
    return result?.removed === true;
  }

  async getWorkflow(scope: SchedulerScope): Promise<SchedulerWorkflowState | null> {
    const result = await this.request<{ workflow?: SchedulerWorkflowState | null }>("/get", { scope });
    return result?.workflow ?? null;
  }

  async recordWorkflowCallback(request: SchedulerWorkflowCallbackRequest): Promise<boolean> {
    const result = await this.request<{ accepted?: boolean }>("/callback", { request });
    return result?.accepted === true;
  }

  async pullResumeSignal(params: {
    scope: Pick<SchedulerScope, "tenantId" | "agentId">;
    correlationId?: string;
  }): Promise<SchedulerWorkflowResumeSignal | null> {
    const result = await this.request<{ signal?: SchedulerWorkflowResumeSignal | null }>(
      "/resume/pull",
      { params },
    );
    return result?.signal ?? null;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.config.authToken) {
        headers.Authorization = `Bearer ${this.config.authToken}`;
      }
      const response = await fetch(`${this.config.endpoint.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as T & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            `temporal orchestrator request failed with status ${response.status}`,
        );
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}
