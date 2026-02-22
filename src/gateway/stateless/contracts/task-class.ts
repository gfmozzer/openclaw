/**
 * TaskClass / JobClass - Classificação canônica para roteamento de execução
 *
 * Define como uma tarefa deve ser executada baseado em suas características
 * de duração, complexidade e requisitos de resiliência.
 *
 * @see ExecutionRoutingPolicy - Usa TaskClass como input para decisão de roteamento
 */

/**
 * Classificação canônica de tarefas para roteamento de execução
 */
export type TaskClass =
  | "inline_sync"
  | "ephemeral_async"
  | "durable_async"
  | "scheduled"
  | "human_approval";

/**
 * Metadados descritivos para cada TaskClass
 */
export type TaskClassMetadata = {
  description: string;
  typicalDurationMs: { min: number; max: number };
  requiresPersistence: boolean;
  supportsRetry: boolean;
  supportsResume: boolean;
  defaultTimeoutMs: number;
};

/**
 * Tabela de metadados por TaskClass
 */
export const TASK_CLASS_METADATA: Record<TaskClass, TaskClassMetadata> = {
  inline_sync: {
    description:
      "Tarefa curta síncrona, resposta imediata, sem necessidade de resume posterior",
    typicalDurationMs: { min: 0, max: 30000 },
    requiresPersistence: false,
    supportsRetry: false,
    supportsResume: false,
    defaultTimeoutMs: 30000,
  },
  ephemeral_async: {
    description:
      "Tarefa assíncrona de curto prazo, buffering, burst control, retry leve",
    typicalDurationMs: { min: 1000, max: 300000 },
    requiresPersistence: false,
    supportsRetry: true,
    supportsResume: false,
    defaultTimeoutMs: 300000,
  },
  durable_async: {
    description:
      "Tarefa longa/durável, precisa de reexecução, estado, resume, callback",
    typicalDurationMs: { min: 30000, max: 86400000 },
    requiresPersistence: true,
    supportsRetry: true,
    supportsResume: true,
    defaultTimeoutMs: 3600000,
  },
  scheduled: {
    description:
      "Tarefa agendada para execução futura (cron ou one-time), requer persistência",
    typicalDurationMs: { min: 0, max: 86400000 },
    requiresPersistence: true,
    supportsRetry: true,
    supportsResume: true,
    defaultTimeoutMs: 3600000,
  },
  human_approval: {
    description:
      "Tarefa que requer aprovação humana antes de prosseguir (opcional, integração com lobster/approval)",
    typicalDurationMs: { min: 60000, max: 604800000 },
    requiresPersistence: true,
    supportsRetry: false,
    supportsResume: true,
    defaultTimeoutMs: 86400000,
  },
};

/**
 * Mapeamento de TaskClass para modo de execução preferido
 * @see ExecutionDecisionMode
 */
export const TASK_CLASS_TO_EXECUTION_MODE: Record<
  TaskClass,
  "inline" | "redis_ephemeral" | "temporal_workflow"
> = {
  inline_sync: "inline",
  ephemeral_async: "redis_ephemeral",
  durable_async: "temporal_workflow",
  scheduled: "temporal_workflow",
  human_approval: "temporal_workflow",
};

/**
 * Input para classificação de uma tarefa
 */
export type TaskClassificationInput = {
  taskType: string;
  estimatedDurationMs?: number;
  requiresResume?: boolean;
  requiresCallback?: boolean;
  isIdempotent?: boolean;
  canRetry?: boolean;
  hasHumanInTheLoop?: boolean;
  scheduleKind?: "immediate" | "delayed" | "recurring";
};

/**
 * Resultado da classificação de uma tarefa
 */
export type TaskClassificationResult = {
  taskClass: TaskClass;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedTimeoutMs: number;
};

/**
 * Classifica uma tarefa baseado nas características fornecidas
 */
export function classifyTask(
  input: TaskClassificationInput,
): TaskClassificationResult {
  // Regra 1: Human approval tem prioridade
  if (input.hasHumanInTheLoop) {
    return {
      taskClass: "human_approval",
      confidence: "high",
      reason: "Requer aprovação humana (human-in-the-loop)",
      suggestedTimeoutMs: TASK_CLASS_METADATA.human_approval.defaultTimeoutMs,
    };
  }

  // Regra 2: Scheduled tasks
  if (input.scheduleKind === "delayed" || input.scheduleKind === "recurring") {
    return {
      taskClass: "scheduled",
      confidence: "high",
      reason: `Agendamento tipo: ${input.scheduleKind}`,
      suggestedTimeoutMs: TASK_CLASS_METADATA.scheduled.defaultTimeoutMs,
    };
  }

  // Regra 3: Tarefas que requerem resume ou callback -> durable
  if (input.requiresResume || input.requiresCallback) {
    return {
      taskClass: "durable_async",
      confidence: "high",
      reason: `Requer ${input.requiresResume ? "resume" : ""}${input.requiresResume && input.requiresCallback ? " e " : ""}${input.requiresCallback ? "callback" : ""}`,
      suggestedTimeoutMs: TASK_CLASS_METADATA.durable_async.defaultTimeoutMs,
    };
  }

  // Regra 4: Duração estimada
  if (input.estimatedDurationMs !== undefined) {
    if (input.estimatedDurationMs > 300000) {
      // > 5 min
      return {
        taskClass: "durable_async",
        confidence: "medium",
        reason: `Duração estimada longa (${input.estimatedDurationMs}ms)`,
        suggestedTimeoutMs: Math.max(
          input.estimatedDurationMs * 2,
          TASK_CLASS_METADATA.durable_async.defaultTimeoutMs,
        ),
      };
    }
    if (input.estimatedDurationMs > 30000) {
      // > 30 seg
      return {
        taskClass: "ephemeral_async",
        confidence: "medium",
        reason: `Duração estimada média (${input.estimatedDurationMs}ms)`,
        suggestedTimeoutMs: Math.max(
          input.estimatedDurationMs * 2,
          TASK_CLASS_METADATA.ephemeral_async.defaultTimeoutMs,
        ),
      };
    }
  }

  // Regra 5: Default - inline sync
  return {
    taskClass: "inline_sync",
    confidence: "high",
    reason: "Tarefa curta síncrona (default)",
    suggestedTimeoutMs: TASK_CLASS_METADATA.inline_sync.defaultTimeoutMs,
  };
}
