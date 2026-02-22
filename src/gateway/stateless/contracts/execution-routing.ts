import type { RequestSource } from "./request-context-contract.js";
import type { TaskClass } from "./task-class.js";

export type ExecutionDecisionMode = "inline" | "redis_ephemeral" | "temporal_workflow";

export type ExecutionDecision = {
  mode: ExecutionDecisionMode;
  queue?: string;
  topic?: string;
  workflowType?: string;
  reason: string;
  priority?: number;
  retryPolicyRef?: string;
};

/**
 * Input para a política de roteamento de execução
 * @see ExecutionRoutingPolicy
 */
export type ExecutionRoutingPolicyInput = {
  taskType: string;
  taskClass: TaskClass;
  requestSource: RequestSource;
  timeoutBudgetMs: number;
  isIdempotent: boolean;
  canRetry: boolean;
  requiresResume: boolean;
  tenantId: string;
  priority?: number;
  /** Hints opcionais do tenant para override de policy */
  tenantPolicyHints?: {
    preferExecutionMode?: ExecutionDecisionMode;
    forceExecutionMode?: ExecutionDecisionMode;
  };
};

/**
 * Política de roteamento de execução
 *
 * Decide qual modo de execução usar baseado nas características da tarefa,
 * contexto da requisição e políticas do tenant.
 */
export type ExecutionRoutingPolicy = {
  /**
   * Determina o modo de execução para uma tarefa
   */
  decide(input: ExecutionRoutingPolicyInput): ExecutionDecision;

  /**
   * Valida se um modo de execução está disponível no ambiente atual
   */
  isModeAvailable(mode: ExecutionDecisionMode): boolean;

  /**
   * Retorna a próxima melhor alternativa quando o modo preferido está indisponível
   */
  fallbackDecision(
    preferredMode: ExecutionDecisionMode,
    input: ExecutionRoutingPolicyInput,
  ): ExecutionDecision;
};

/**
 * Implementação padrão da política de roteamento
 */
export function createDefaultExecutionRoutingPolicy(
  availableModes: ExecutionDecisionMode[],
): ExecutionRoutingPolicy {
  return {
    decide(input: ExecutionRoutingPolicyInput): ExecutionDecision {
      // Verifica se há force override do tenant
      if (input.tenantPolicyHints?.forceExecutionMode) {
        const forcedMode = input.tenantPolicyHints.forceExecutionMode;
        if (this.isModeAvailable(forcedMode)) {
          return {
            mode: forcedMode,
            reason: `Forced by tenant policy: ${forcedMode}`,
            priority: input.priority,
          };
        }
        // Fallback se modo forçado está indisponível
        return this.fallbackDecision(forcedMode, input);
      }

      // Mapeamento TaskClass -> modo preferido
      const modeMap: Record<TaskClass, ExecutionDecisionMode> = {
        inline_sync: "inline",
        ephemeral_async: "redis_ephemeral",
        durable_async: "temporal_workflow",
        scheduled: "temporal_workflow",
        human_approval: "temporal_workflow",
      };

      const preferredMode = modeMap[input.taskClass];

      // Se modo preferido está disponível, usa ele
      if (this.isModeAvailable(preferredMode)) {
        const decision: ExecutionDecision = {
          mode: preferredMode,
          reason: `TaskClass ${input.taskClass} -> ${preferredMode}`,
          priority: input.priority,
        };

        // Adiciona configurações específicas por modo
        if (preferredMode === "redis_ephemeral") {
          decision.queue = `ephemeral:${input.tenantId}`;
        } else if (preferredMode === "temporal_workflow") {
          decision.workflowType = input.taskType;
        }

        return decision;
      }

      // Fallback para modo indisponível
      return this.fallbackDecision(preferredMode, input);
    },

    isModeAvailable(mode: ExecutionDecisionMode): boolean {
      return availableModes.includes(mode);
    },

    fallbackDecision(
      preferredMode: ExecutionDecisionMode,
      input: ExecutionRoutingPolicyInput,
    ): ExecutionDecision {
      // Hierarquia de fallback: inline -> redis -> temporal
      const fallbackChain: ExecutionDecisionMode[] = [
        "inline",
        "redis_ephemeral",
        "temporal_workflow",
      ];

      const preferredIndex = fallbackChain.indexOf(preferredMode);

      // Tenta modos mais robustos primeiro
      for (let i = preferredIndex + 1; i < fallbackChain.length; i++) {
        const mode = fallbackChain[i];
        if (this.isModeAvailable(mode)) {
          return {
            mode,
            reason: `Fallback from ${preferredMode} (unavailable) to ${mode}`,
            priority: input.priority,
          };
        }
      }

      // Se não achou modo mais robusto, retorna inline como último recurso
      return {
        mode: "inline",
        reason: `Emergency fallback to inline (preferred ${preferredMode} unavailable)`,
        priority: input.priority,
      };
    },
  };
}

