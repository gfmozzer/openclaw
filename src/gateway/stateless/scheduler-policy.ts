export type SchedulerCallerRole = "supervisor" | "worker";

export type SchedulerAuthorizationFailureCode =
  | "SCHEDULE_FORBIDDEN"
  | "TARGET_NOT_IN_TEAM"
  | "CROSS_TENANT_FORBIDDEN";

export type SchedulerAuthorizationInput = {
  tenantId: string;
  targetTenantId: string;
  callerAgentId: string;
  callerRole: SchedulerCallerRole;
  targetAgentId: string;
};

export type SchedulerAuthorizationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: SchedulerAuthorizationFailureCode;
      message: string;
    };

export type SchedulerTeamRule = {
  tenantId: string;
  supervisorAgentId: string;
  workerAgentIds: string[];
};

export type SchedulerTeamMap = Map<string, Map<string, Set<string>>>;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function ensureTenant(map: SchedulerTeamMap, tenantId: string): Map<string, Set<string>> {
  const existing = map.get(tenantId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, Set<string>>();
  map.set(tenantId, created);
  return created;
}

function ensureSupervisor(
  tenantMap: Map<string, Set<string>>,
  supervisorAgentId: string,
): Set<string> {
  const existing = tenantMap.get(supervisorAgentId);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  tenantMap.set(supervisorAgentId, created);
  return created;
}

function addRule(map: SchedulerTeamMap, rule: SchedulerTeamRule): void {
  const tenantId = nonEmpty(rule.tenantId);
  const supervisorAgentId = nonEmpty(rule.supervisorAgentId);
  if (!tenantId || !supervisorAgentId) {
    return;
  }
  const tenantMap = ensureTenant(map, tenantId);
  const workers = ensureSupervisor(tenantMap, supervisorAgentId);
  for (const worker of rule.workerAgentIds) {
    const normalized = nonEmpty(worker);
    if (normalized) {
      workers.add(normalized);
    }
  }
}

function fromArray(value: unknown): SchedulerTeamMap {
  const map: SchedulerTeamMap = new Map();
  if (!Array.isArray(value)) {
    return map;
  }
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    addRule(map, {
      tenantId: typeof record.tenantId === "string" ? record.tenantId : "",
      supervisorAgentId:
        typeof record.supervisorAgentId === "string" ? record.supervisorAgentId : "",
      workerAgentIds: Array.isArray(record.workerAgentIds)
        ? record.workerAgentIds.filter((worker): worker is string => typeof worker === "string")
        : [],
    });
  }
  return map;
}

function fromObject(value: unknown): SchedulerTeamMap {
  const map: SchedulerTeamMap = new Map();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return map;
  }
  const tenants = value as Record<string, unknown>;
  for (const [tenantIdRaw, supervisorsRaw] of Object.entries(tenants)) {
    const tenantId = nonEmpty(tenantIdRaw);
    if (!tenantId || !supervisorsRaw || typeof supervisorsRaw !== "object") {
      continue;
    }
    const supervisors = supervisorsRaw as Record<string, unknown>;
    for (const [supervisorAgentIdRaw, workersRaw] of Object.entries(supervisors)) {
      const supervisorAgentId = nonEmpty(supervisorAgentIdRaw);
      if (!supervisorAgentId || !Array.isArray(workersRaw)) {
        continue;
      }
      addRule(map, {
        tenantId,
        supervisorAgentId,
        workerAgentIds: workersRaw.filter((worker): worker is string => typeof worker === "string"),
      });
    }
  }
  return map;
}

export function resolveSchedulerTeamMapFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SchedulerTeamMap {
  const raw = nonEmpty(env.OPENCLAW_TEMPORAL_TEAM_MAP_JSON);
  if (!raw) {
    return new Map();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return fromArray(parsed);
    }
    return fromObject(parsed);
  } catch {
    return new Map();
  }
}

function isWorkerOnSupervisorTeam(params: {
  teams: SchedulerTeamMap;
  tenantId: string;
  supervisorAgentId: string;
  workerAgentId: string;
}): boolean {
  const supervisors = params.teams.get(params.tenantId);
  if (!supervisors) {
    return false;
  }
  const workers = supervisors.get(params.supervisorAgentId);
  if (!workers) {
    return false;
  }
  return workers.has(params.workerAgentId);
}

export function authorizeSchedulerAction(params: {
  input: SchedulerAuthorizationInput;
  teams: SchedulerTeamMap;
}): SchedulerAuthorizationResult {
  const { input } = params;
  if (input.tenantId !== input.targetTenantId) {
    return {
      ok: false,
      code: "CROSS_TENANT_FORBIDDEN",
      message: "cross-tenant scheduling is forbidden",
    };
  }

  if (input.callerRole === "worker") {
    if (input.callerAgentId !== input.targetAgentId) {
      return {
        ok: false,
        code: "SCHEDULE_FORBIDDEN",
        message: "worker can only schedule jobs for self",
      };
    }
    return { ok: true };
  }

  if (input.callerAgentId === input.targetAgentId) {
    return { ok: true };
  }

  if (
    !isWorkerOnSupervisorTeam({
      teams: params.teams,
      tenantId: input.tenantId,
      supervisorAgentId: input.callerAgentId,
      workerAgentId: input.targetAgentId,
    })
  ) {
    return {
      ok: false,
      code: "TARGET_NOT_IN_TEAM",
      message: "target agent is not part of supervisor team",
    };
  }

  return { ok: true };
}
