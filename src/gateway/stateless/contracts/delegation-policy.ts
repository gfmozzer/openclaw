/**
 * DelegationPolicy - Política de delegação entre supervisor e workers
 *
 * Define regras para:
 * - Quem pode delegar para quem
 * - Restrições de scheduling por role
 * - Herança de capabilities e scopes
 *
 * @see DelegationEnvelope - Contrato de envelope de delegação
 * @see EnterpriseRole - Roles definidos em enterprise-orchestration.ts
 */

import type { EnterpriseRole, EnterpriseScope } from "./enterprise-orchestration.js";

/**
 * Tipo de target de scheduling
 */
export type ScheduleTargetType = "self" | "team";

/**
 * Input para validação de permissão de delegação
 */
export type DelegationPermissionInput = {
  /** Quem está delegando */
  delegatedBy: {
    tenantId: string;
    principalId: string;
    role: EnterpriseRole;
    scopes: EnterpriseScope[];
  };
  /** Target worker que receberá a tarefa */
  targetWorker: {
    tenantId: string;
    agentId: string;
    role: EnterpriseRole;
    teamId?: string;
  };
  /** Contexto da tarefa sendo delegada */
  taskContext: {
    taskType: string;
    requiredScopes?: EnterpriseScope[];
    requiredSkills?: string[];
  };
  /** Verificar se é scheduling (true) ou delegation direta (false) */
  isScheduling: boolean;
  /** Se scheduling, qual o target type */
  scheduleTarget?: ScheduleTargetType;
};

/**
 * Resultado da verificação de permissão de delegação
 */
export type DelegationPermissionResult =
  | {
      allowed: true;
      reason: string;
      /** Scopes efetivos após interseção */
      effectiveScopes: EnterpriseScope[];
      /** Skills permitidas após restrição */
      effectiveSkillAllowlist?: string[];
    }
  | {
      allowed: false;
      reason: string;
      errorCode: DelegationErrorCode;
    };

/**
 * Códigos de erro canônicos para delegação
 */
export type DelegationErrorCode =
  | "DELEGATION_DENIED"
  | "WORKER_NOT_IN_TEAM"
  | "CROSS_TENANT_DELEGATION_FORBIDDEN"
  | "INSUFFICIENT_SCOPES"
  | "SCHEDULE_TEAM_DENIED"
  | "WORKER_CANNOT_DELEGATE"
  | "TARGET_ROLE_INVALID";

/**
 * Regras de delegação por role
 */
export type DelegationRulesByRole = {
  supervisor: {
    /** Pode delegar para workers do time */
    canDelegateToWorkers: true;
    /** Pode agendar para self */
    canScheduleSelf: true;
    /** Pode agendar para team */
    canScheduleTeam: true;
    /** Deve validar se worker está no mesmo team */
    requiresTeamMembership: true;
  };
  worker: {
    /** Worker não pode delegar para outro worker */
    canDelegateToWorkers: false;
    /** Pode agendar apenas para self */
    canScheduleSelf: true;
    /** Não pode agendar para team */
    canScheduleTeam: false;
    /** Não aplicável */
    requiresTeamMembership: false;
  };
  admin: {
    /** Admin pode delegar para qualquer worker do tenant */
    canDelegateToWorkers: true;
    /** Pode agendar para self */
    canScheduleSelf: true;
    /** Pode agendar para team */
    canScheduleTeam: true;
    /** Admin pode delegar cross-team */
    requiresTeamMembership: false;
  };
  employee: {
    /** Employee não pode delegar */
    canDelegateToWorkers: false;
    /** Pode agendar para self */
    canScheduleSelf: true;
    /** Não pode agendar para team */
    canScheduleTeam: false;
    /** Não aplicável */
    requiresTeamMembership: false;
  };
};

/**
 * Configuração da política de delegação
 */
export type DelegationPolicyConfig = {
  /** Se true, exige que target worker tenha scopes necessários */
  enforceScopeIntersection: boolean;
  /** Se true, restringe skill allowlist na delegação */
  enforceSkillAllowlist: boolean;
  /** Lista de skills que nunca podem ser delegadas */
  nonDelegatableSkills?: string[];
  /** Timeout padrão para tarefas delegadas (ms) */
  defaultDelegationTimeoutMs: number;
};

/**
 * Política de delegação
 */
export type DelegationPolicy = {
  /**
   * Verifica se uma delegação é permitida
   */
  checkPermission(
    input: DelegationPermissionInput,
  ): DelegationPermissionResult;

  /**
   * Calcula scopes efetivos após interseção
   */
  computeEffectiveScopes(
    delegatorScopes: EnterpriseScope[],
    targetWorkerScopes: EnterpriseScope[],
  ): EnterpriseScope[];

  /**
   * Calcula skill allowlist efetiva após restrição
   */
  computeEffectiveSkillAllowlist(
    delegatorAllowlist: string[] | undefined,
    taskRequiredSkills: string[] | undefined,
    targetWorkerSkills: string[] | undefined,
  ): string[] | undefined;

  /**
   * Retorna as regras para um determinado role
   */
  getRulesForRole(role: EnterpriseRole): DelegationRulesByRole[EnterpriseRole];
};

/**
 * Cria uma instância da política de delegação padrão
 */
export function createDefaultDelegationPolicy(
  config: DelegationPolicyConfig,
  teamMembershipLookup: {
    isWorkerInTeam(workerAgentId: string, teamId: string): boolean;
    getWorkerTeam(workerAgentId: string): string | undefined;
  },
): DelegationPolicy {
  const rulesByRole: DelegationRulesByRole = {
    supervisor: {
      canDelegateToWorkers: true,
      canScheduleSelf: true,
      canScheduleTeam: true,
      requiresTeamMembership: true,
    },
    worker: {
      canDelegateToWorkers: false,
      canScheduleSelf: true,
      canScheduleTeam: false,
      requiresTeamMembership: false,
    },
    admin: {
      canDelegateToWorkers: true,
      canScheduleSelf: true,
      canScheduleTeam: true,
      requiresTeamMembership: false,
    },
    employee: {
      canDelegateToWorkers: false,
      canScheduleSelf: true,
      canScheduleTeam: false,
      requiresTeamMembership: false,
    },
  };

  return {
    checkPermission(input: DelegationPermissionInput): DelegationPermissionResult {
      const rules = rulesByRole[input.delegatedBy.role];

      // Regra 1: Verificar cross-tenant
      if (input.delegatedBy.tenantId !== input.targetWorker.tenantId) {
        return {
          allowed: false,
          reason: "Cross-tenant delegation is forbidden",
          errorCode: "CROSS_TENANT_DELEGATION_FORBIDDEN",
        };
      }

      // Regra 2: Worker não pode delegar para outro worker
      if (input.delegatedBy.role === "worker" && input.isScheduling === false) {
        return {
          allowed: false,
          reason: "Workers cannot delegate tasks to other workers",
          errorCode: "WORKER_CANNOT_DELEGATE",
        };
      }

      // Regra 3: Verificar scheduling permissions
      if (input.isScheduling) {
        const scheduleTarget = input.scheduleTarget ?? "self";

        if (scheduleTarget === "team" && !rules.canScheduleTeam) {
          return {
            allowed: false,
            reason: `${input.delegatedBy.role} cannot schedule for team, only self`,
            errorCode: "SCHEDULE_TEAM_DENIED",
          };
        }
      }

      // Regra 4: Verificar team membership (para supervisor)
      if (
        rules.requiresTeamMembership &&
        input.delegatedBy.role !== "admin"
      ) {
        // Obtém a team do supervisor (a partir do team do worker ou lookup)
        const workerTeamId = input.targetWorker.teamId ?? teamMembershipLookup.getWorkerTeam(input.targetWorker.agentId);
        const supervisorTeamId = teamMembershipLookup.getWorkerTeam(input.delegatedBy.principalId);
        
        // Se não conseguir determinar as teams, nega
        if (!workerTeamId || !supervisorTeamId) {
          return {
            allowed: false,
            reason: `Cannot determine team membership`,
            errorCode: "WORKER_NOT_IN_TEAM",
          };
        }
        
        // Worker deve estar na mesma team do supervisor
        if (workerTeamId !== supervisorTeamId) {
          return {
            allowed: false,
            reason: `Target worker is not in the supervisor's team`,
            errorCode: "WORKER_NOT_IN_TEAM",
          };
        }
      }

      // Regra 5: Verificar scopes (se enforce estiver ativo)
      if (config.enforceScopeIntersection && input.taskContext.requiredScopes) {
        const hasRequiredScopes = input.taskContext.requiredScopes.every((scope) =>
          input.delegatedBy.scopes.includes(scope),
        );
        if (!hasRequiredScopes) {
          return {
            allowed: false,
            reason: "Delegator lacks required scopes for this task",
            errorCode: "INSUFFICIENT_SCOPES",
          };
        }
      }

      // Delegação permitida - calcular scopes efetivos
      const effectiveScopes = this.computeEffectiveScopes(
        input.delegatedBy.scopes,
        input.targetWorker.teamId
          ? [] // Se target tem team, usa scopes do delegator
          : input.delegatedBy.scopes,
      );

      const effectiveSkillAllowlist = this.computeEffectiveSkillAllowlist(
        undefined, // delegator allowlist (quando Plan 1 estiver pronto)
        input.taskContext.requiredSkills,
        undefined, // target worker skills (quando Plan 1 estiver pronto)
      );

      return {
        allowed: true,
        reason: `Delegation allowed for ${input.delegatedBy.role} -> ${input.targetWorker.role}`,
        effectiveScopes,
        effectiveSkillAllowlist,
      };
    },

    computeEffectiveScopes(
      delegatorScopes: EnterpriseScope[],
      targetWorkerScopes: EnterpriseScope[],
    ): EnterpriseScope[] {
      if (!config.enforceScopeIntersection || targetWorkerScopes.length === 0) {
        return [...delegatorScopes];
      }
      // Interseção de scopes
      return delegatorScopes.filter((scope) => targetWorkerScopes.includes(scope));
    },

    computeEffectiveSkillAllowlist(
      delegatorAllowlist: string[] | undefined,
      taskRequiredSkills: string[] | undefined,
      targetWorkerSkills: string[] | undefined,
    ): string[] | undefined {
      if (!config.enforceSkillAllowlist) {
        return delegatorAllowlist;
      }

      // Se há non-delegatable skills, remove-as
      let allowlist = delegatorAllowlist;
      if (allowlist && config.nonDelegatableSkills) {
        allowlist = allowlist.filter(
          (skill) => !config.nonDelegatableSkills!.includes(skill),
        );
      }

      // Interseção com skills do worker (se disponível)
      if (allowlist && targetWorkerSkills) {
        allowlist = allowlist.filter((skill) => targetWorkerSkills.includes(skill));
      }

      // Garante que required skills estão presentes
      if (taskRequiredSkills && allowlist) {
        const missingSkills = taskRequiredSkills.filter(
          (skill) => !allowlist!.includes(skill),
        );
        if (missingSkills.length > 0) {
          // Retorna undefined para indicar restrição inválida
          return undefined;
        }
      }

      return allowlist;
    },

    getRulesForRole(role: EnterpriseRole): DelegationRulesByRole[EnterpriseRole] {
      return rulesByRole[role];
    },
  };
}

/**
 * Configuração padrão da política de delegação
 */
export const DEFAULT_DELEGATION_POLICY_CONFIG: DelegationPolicyConfig = {
  enforceScopeIntersection: true,
  enforceSkillAllowlist: false, // Ativar quando Plan 1 estiver pronto
  nonDelegatableSkills: ["admin:config", "tenant:delete"],
  defaultDelegationTimeoutMs: 300000, // 5 minutos
};
