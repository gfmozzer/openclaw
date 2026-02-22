import {
  ErrorCodes,
  errorShape,
} from "../protocol/index.js";
import { authorizeEnterpriseScope } from "../stateless/enterprise-authorization.js";
import type { SwarmTeamDefinition, SwarmWorkerMember } from "../stateless/contracts/index.js";
import type { EnterpriseIdentity, EnterpriseScope } from "../stateless/contracts/enterprise-orchestration.js";
import type { GatewayRequestHandlers } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readWorkers(value: unknown): SwarmWorkerMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const workers: SwarmWorkerMember[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const agentId = nonEmptyString(record.agentId);
    if (!agentId) {
      continue;
    }
    const displayName = nonEmptyString(record.displayName) ?? undefined;
    const specialties = Array.isArray(record.specialties)
      ? record.specialties.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : undefined;
    const allowedScopes = Array.isArray(record.allowedScopes)
      ? record.allowedScopes.filter(
          (entry): entry is EnterpriseScope => typeof entry === "string" && entry.trim().length > 0,
        )
      : undefined;
    workers.push({
      agentId,
      displayName,
      specialties,
      allowedScopes,
    });
  }
  return workers;
}

function buildTeamDefinition(params: {
  tenantId: string;
  team: Record<string, unknown>;
}): SwarmTeamDefinition | null {
  const teamId = nonEmptyString(params.team.teamId);
  const supervisorAgentId = nonEmptyString(params.team.supervisorAgentId);
  if (!teamId || !supervisorAgentId) {
    return null;
  }
  return {
    tenantId: params.tenantId,
    teamId,
    supervisorAgentId,
    workers: readWorkers(params.team.workers),
    updatedAtEpochMs: Date.now(),
  };
}

export const swarmHandlers: GatewayRequestHandlers = {
  "swarm.team.upsert": async ({ params, respond, context }) => {
    if (!context.swarmDirectoryStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "swarm directory store is not configured"));
      return;
    }
    const record = asRecord(params);
    if (!record) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid swarm.team.upsert params"));
      return;
    }
    const identity = context.enterprisePrincipal ?? null;
    const teamRecord = asRecord(record.team);
    const tenantId = nonEmptyString(record.tenantId) ?? identity?.tenantId ?? null;
    if (!identity || !tenantId || !teamRecord) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing authenticated principal, tenantId or team"));
      return;
    }
    const auth = authorizeEnterpriseScope({
      identity,
      requiredScope: "swarm:write",
      tenantId,
    });
    if (!auth.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, auth.error.message, {
          details: { code: auth.error.code, ...auth.error.details },
        }),
      );
      return;
    }
    const team = buildTeamDefinition({ tenantId, team: teamRecord });
    if (!team) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid team payload"));
      return;
    }
    const saved = await context.swarmDirectoryStore.upsert(team);
    respond(true, { ok: true, team: saved }, undefined);
  },
  "swarm.team.get": async ({ params, respond, context }) => {
    if (!context.swarmDirectoryStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "swarm directory store is not configured"));
      return;
    }
    const record = asRecord(params);
    if (!record) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid swarm.team.get params"));
      return;
    }
    const identity = context.enterprisePrincipal ?? null;
    const tenantId = nonEmptyString(record.tenantId) ?? identity?.tenantId ?? null;
    const teamId = nonEmptyString(record.teamId);
    if (!identity || !tenantId || !teamId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing authenticated principal, tenantId or teamId"));
      return;
    }
    const auth = authorizeEnterpriseScope({
      identity,
      requiredScope: "swarm:read",
      tenantId,
    });
    if (!auth.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, auth.error.message, {
          details: { code: auth.error.code, ...auth.error.details },
        }),
      );
      return;
    }
    const team = await context.swarmDirectoryStore.get({ tenantId, teamId });
    respond(true, { team }, undefined);
  },
  "swarm.team.list": async ({ params, respond, context }) => {
    if (!context.swarmDirectoryStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "swarm directory store is not configured"));
      return;
    }
    const record = asRecord(params);
    if (!record) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid swarm.team.list params"));
      return;
    }
    const identity = context.enterprisePrincipal ?? null;
    const tenantId = nonEmptyString(record.tenantId) ?? identity?.tenantId ?? null;
    if (!identity || !tenantId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing authenticated principal or tenantId"));
      return;
    }
    const auth = authorizeEnterpriseScope({
      identity,
      requiredScope: "swarm:read",
      tenantId,
    });
    if (!auth.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, auth.error.message, {
          details: { code: auth.error.code, ...auth.error.details },
        }),
      );
      return;
    }
    const teams = await context.swarmDirectoryStore.list({ tenantId });
    respond(true, { teams }, undefined);
  },
  "swarm.team.delete": async ({ params, respond, context }) => {
    if (!context.swarmDirectoryStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "swarm directory store is not configured"));
      return;
    }
    const record = asRecord(params);
    if (!record) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid swarm.team.delete params"));
      return;
    }
    const identity = context.enterprisePrincipal ?? null;
    const tenantId = nonEmptyString(record.tenantId) ?? identity?.tenantId ?? null;
    const teamId = nonEmptyString(record.teamId);
    if (!identity || !tenantId || !teamId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing authenticated principal, tenantId or teamId"));
      return;
    }
    const auth = authorizeEnterpriseScope({
      identity,
      requiredScope: "swarm:write",
      tenantId,
    });
    if (!auth.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, auth.error.message, {
          details: { code: auth.error.code, ...auth.error.details },
        }),
      );
      return;
    }
    const removed = await context.swarmDirectoryStore.delete({ tenantId, teamId });
    respond(true, { ok: true, removed }, undefined);
  },
  "swarm.worker.validate": async ({ params, respond, context }) => {
    if (!context.swarmDirectoryStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "swarm directory store is not configured"));
      return;
    }
    const record = asRecord(params);
    if (!record) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid swarm.worker.validate params"));
      return;
    }
    const identity = context.enterprisePrincipal ?? null;
    const tenantId = nonEmptyString(record.tenantId) ?? identity?.tenantId ?? null;
    const workerAgentId = nonEmptyString(record.workerAgentId);
    const supervisorAgentId = nonEmptyString(record.supervisorAgentId);
    if (!identity || !tenantId || !workerAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "missing authenticated principal, tenantId or workerAgentId"));
      return;
    }
    const auth = authorizeEnterpriseScope({
      identity,
      requiredScope: "swarm:read",
      tenantId,
    });
    if (!auth.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.FORBIDDEN, auth.error.message, {
          details: { code: auth.error.code, ...auth.error.details },
        }),
      );
      return;
    }

    // Plan 2: Validação de delegação de worker
    // Se supervisorAgentId fornecido, verifica se worker está no time dele
    const effectiveSupervisorId = supervisorAgentId ?? (identity as EnterpriseIdentity).requesterId;
    const canDelegate = await validateWorkerDelegation({
      store: context.swarmDirectoryStore,
      tenantId,
      supervisorAgentId: effectiveSupervisorId,
      workerAgentId,
      requesterRole: (identity as EnterpriseIdentity).role,
    });

    respond(true, {
      valid: canDelegate.valid,
      workerAgentId,
      supervisorAgentId: effectiveSupervisorId,
      teamId: canDelegate.teamId,
      reason: canDelegate.reason,
    }, undefined);
  },
};

// Plan 2: Helper para validar delegação de worker
async function validateWorkerDelegation(params: {
  store: NonNullable<import("./types.js").GatewayRequestContext["swarmDirectoryStore"]>;
  tenantId: string;
  supervisorAgentId: string;
  workerAgentId: string;
  requesterRole: EnterpriseIdentity["role"];
}): Promise<{ valid: boolean; teamId?: string; reason?: string }> {
  // Admin pode delegar para qualquer worker do tenant
  if (params.requesterRole === "admin") {
    const teams = await params.store.list({ tenantId: params.tenantId });
    for (const team of teams) {
      const workerExists = team.workers.some((w) => w.agentId === params.workerAgentId);
      if (workerExists) {
        return { valid: true, teamId: team.teamId };
      }
    }
    return { valid: true, reason: "admin can delegate to any worker in tenant" };
  }

  // Supervisor só pode delegar para workers do próprio time
  const teams = await params.store.list({ tenantId: params.tenantId });
  for (const team of teams) {
    if (team.supervisorAgentId === params.supervisorAgentId) {
      const workerExists = team.workers.some((w) => w.agentId === params.workerAgentId);
      if (workerExists) {
        return { valid: true, teamId: team.teamId };
      }
      return { valid: false, teamId: team.teamId, reason: "worker not in supervisor team" };
    }
  }

  return { valid: false, reason: "supervisor has no team in tenant" };
}
