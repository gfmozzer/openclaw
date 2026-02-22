/**
 * InternalWorkerInvocationContract - Contrato para invocação interna de workers
 *
 * Define como supervisor/manager invoca workers internos sem canal externo.
 * Suporta:
 * - invoke (sync) para tarefas pequenas
 * - enqueue/schedule (async) para tarefas roteadas por policy
 * - callback/resume quando Temporal for escolhido
 *
 * @see DelegationEnvelope - Usado para contexto de delegação
 * @see ExecutionDecision - Determina qual método de invocação usar
 */

import type { DelegationEnvelope } from "./delegation-envelope.js";
import type { ExecutionDecision, ExecutionDecisionMode } from "./execution-routing.js";

/**
 * Método de invocação interna
 */
export type InternalInvocationMethod = "sync_invoke" | "async_enqueue" | "schedule" | "callback";

/**
 * Request para invocação síncrona (inline)
 * Usado para: tarefas curtas, resposta imediata
 */
export type SyncInvokeRequest = {
  method: "sync_invoke";
  taskId: string;
  targetWorkerAgentId: string;
  tenantId: string;
  /** Payload da tarefa */
  payload: Record<string, unknown>;
  /** Contexto de delegação (se houver) */
  delegationContext?: DelegationEnvelope;
  /** Timeout em ms */
  timeoutMs: number;
  /** Trace context */
  trace: {
    requestId: string;
    correlationId: string;
    sessionKey?: string;
  };
};

/**
 * Resultado da invocação síncrona
 */
export type SyncInvokeResult =
  | {
      success: true;
      taskId: string;
      output: Record<string, unknown>;
      executionTimeMs: number;
    }
  | {
      success: false;
      taskId: string;
      error: {
        code: InternalWorkerErrorCode;
        message: string;
        retryable: boolean;
      };
      executionTimeMs: number;
    };

/**
 * Request para enqueue assíncrono (Redis/BullMQ/ephemeral)
 * Usado para: buffering, burst control, processamento async simples
 */
export type AsyncEnqueueRequest = {
  method: "async_enqueue";
  taskId: string;
  targetWorkerAgentId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  delegationContext?: DelegationEnvelope;
  /** Configuração da fila */
  queueConfig: {
    queueName: string;
    priority?: number;
    delayMs?: number;
    attempts?: number;
    backoff?: {
      type: "fixed" | "exponential";
      delayMs: number;
    };
  };
  trace: {
    requestId: string;
    correlationId: string;
    sessionKey?: string;
  };
};

/**
 * Resultado do enqueue assíncrono
 */
export type AsyncEnqueueResult =
  | {
      success: true;
      taskId: string;
      jobId: string;
      queuedAt: number;
      estimatedExecutionAt?: number;
    }
  | {
      success: false;
      taskId: string;
      error: {
        code: InternalWorkerErrorCode;
        message: string;
      };
    };

/**
 * Request para agendamento (Temporal/scheduled)
 * Usado para: tarefas agendadas, workflows duráveis
 */
export type ScheduleRequest = {
  method: "schedule";
  taskId: string;
  targetWorkerAgentId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  delegationContext?: DelegationEnvelope;
  /** Tipo de agendamento */
  schedule:
    | { kind: "immediate" }
    | { kind: "at"; atEpochMs: number }
    | { kind: "cron"; expr: string; tz?: string };
  /** Workflow configuration */
  workflowConfig?: {
    workflowType: string;
    taskQueue?: string;
    retryPolicy?: {
      maximumAttempts: number;
      initialInterval: string;
      maximumInterval: string;
      backoffCoefficient: number;
    };
    executionTimeout?: string;
  };
  trace: {
    requestId: string;
    correlationId: string;
    sessionKey?: string;
  };
};

/**
 * Resultado do agendamento
 */
export type ScheduleResult =
  | {
      success: true;
      taskId: string;
      workflowId: string;
      runId?: string;
      scheduledAt: number;
    }
  | {
      success: false;
      taskId: string;
      error: {
        code: InternalWorkerErrorCode;
        message: string;
      };
    };

/**
 * Request para callback/resume de workflow
 * Usado quando Temporal workflow precisa ser resumido
 */
export type CallbackRequest = {
  method: "callback";
  taskId: string;
  targetWorkerAgentId: string;
  tenantId: string;
  /** Referência ao workflow original */
  workflowRef: {
    workflowId: string;
    runId?: string;
  };
  /** Status do callback */
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  /** Output ou erro */
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  trace: {
    requestId: string;
    correlationId: string;
    sessionKey?: string;
  };
};

/**
 * Resultado do callback
 */
export type CallbackResult =
  | {
      success: true;
      taskId: string;
      workflowId: string;
      resumed: boolean;
    }
  | {
      success: false;
      taskId: string;
      error: {
        code: InternalWorkerErrorCode;
        message: string;
      };
    };

/**
 * Union type de todos os requests de invocação
 */
export type InternalWorkerInvocationRequest =
  | SyncInvokeRequest
  | AsyncEnqueueRequest
  | ScheduleRequest
  | CallbackRequest;

/**
 * Union type de todos os resultados
 */
export type InternalWorkerInvocationResult =
  | SyncInvokeResult
  | AsyncEnqueueResult
  | ScheduleResult
  | CallbackResult;

/**
 * Códigos de erro canônicos para invocação interna
 */
export type InternalWorkerErrorCode =
  | "WORKER_UNAVAILABLE"
  | "WORKER_NOT_FOUND"
  | "EXECUTION_TIMEOUT"
  | "RATE_LIMITED"
  | "QUEUE_FULL"
  | "WORKFLOW_NOT_FOUND"
  | "INVALID_DELEGATION_CONTEXT"
  | "SKILL_NOT_ALLOWED"
  | "PROVIDER_CONFIG_MISSING"
  | "EXECUTION_MODE_UNAVAILABLE"
  | "INTERNAL_ERROR";

/**
 * Contrato para invocação interna de worker
 */
export type InternalWorkerInvoker = {
  /**
   * Invoca uma tarefa síncrona (inline)
   */
  invokeSync(request: SyncInvokeRequest): Promise<SyncInvokeResult>;

  /**
   * Enfileira uma tarefa assíncrona
   */
  enqueue(request: AsyncEnqueueRequest): Promise<AsyncEnqueueResult>;

  /**
   * Agenda uma tarefa para execução futura
   */
  schedule(request: ScheduleRequest): Promise<ScheduleResult>;

  /**
   * Envia callback/resume para um workflow
   */
  sendCallback(request: CallbackRequest): Promise<CallbackResult>;
};

/**
 * Input para roteamento de invocação
 * Usado para decidir qual método de invocação usar baseado no ExecutionDecision
 */
export type InvocationRoutingInput = {
  executionDecision: ExecutionDecision;
  delegationEnvelope?: DelegationEnvelope;
  taskPayload: Record<string, unknown>;
  trace: {
    requestId: string;
    correlationId: string;
    sessionKey?: string;
  };
};

/**
 * Determina o método de invocação baseado no modo de execução
 */
export function resolveInvocationMethod(
  mode: ExecutionDecisionMode,
): InternalInvocationMethod {
  switch (mode) {
    case "inline":
      return "sync_invoke";
    case "redis_ephemeral":
      return "async_enqueue";
    case "temporal_workflow":
      return "schedule";
    default:
      return "sync_invoke";
  }
}

/**
 * Cria o request de invocação apropriado baseado no routing input
 */
export function createInvocationRequest(
  input: InvocationRoutingInput,
  targetWorkerAgentId: string,
  tenantId: string,
): InternalWorkerInvocationRequest {
  const base = {
    taskId: input.delegationEnvelope?.taskId ?? crypto.randomUUID(),
    targetWorkerAgentId,
    tenantId,
    payload: input.taskPayload,
    delegationContext: input.delegationEnvelope,
    trace: input.trace,
  };

  const method = resolveInvocationMethod(input.executionDecision.mode);

  switch (method) {
    case "sync_invoke":
      return {
        method: "sync_invoke",
        ...base,
        timeoutMs: 30000,
      };

    case "async_enqueue":
      return {
        method: "async_enqueue",
        ...base,
        queueConfig: {
          queueName: input.executionDecision.queue ?? `default:${tenantId}`,
          priority: input.executionDecision.priority,
        },
      };

    case "schedule":
      return {
        method: "schedule",
        ...base,
        schedule: { kind: "immediate" },
        workflowConfig: {
          workflowType:
            input.executionDecision.workflowType ?? "default-worker-task",
          taskQueue: input.executionDecision.queue,
        },
      };

    default:
      return {
        method: "sync_invoke",
        ...base,
        timeoutMs: 30000,
      };
  }
}

/**
 * Configuração do worker para invocação interna
 * Cada worker pode ter sua própria configuração de provider/modelo
 */
export type InternalWorkerConfig = {
  agentId: string;
  tenantId: string;
  /** Provider a ser usado (independente do supervisor) */
  providerConfig: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  };
  /** Skills habilitadas para este worker */
  enabledSkills: string[];
  /** Restrições de execução */
  executionConstraints?: {
    maxConcurrentTasks?: number;
    maxTaskDurationMs?: number;
    allowedExecutionModes?: ExecutionDecisionMode[];
  };
  /** Callback URL para notificações (opcional) */
  callbackUrl?: string;
};
