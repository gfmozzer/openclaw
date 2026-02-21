import type { GatewayBrowserClient } from "../gateway.ts";

export type EnterpriseRole = "admin" | "supervisor" | "worker";

export type EnterpriseIdentityInput = {
  tenantId: string;
  requesterId: string;
  role: EnterpriseRole;
  scopes: string;
};

export type SwarmWorkerMember = {
  agentId: string;
  displayName?: string;
  specialties?: string[];
  allowedScopes?: string[];
};

export type SwarmTeamDefinition = {
  tenantId: string;
  teamId: string;
  supervisorAgentId: string;
  workers: SwarmWorkerMember[];
  updatedAtEpochMs: number;
};

export type SwarmWorkerForm = {
  agentId: string;
  displayName: string;
  specialties: string;
  allowedScopes: string;
};

export type SwarmFormState = {
  teamId: string;
  supervisorAgentId: string;
  workers: SwarmWorkerForm[];
};

export type SwarmState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  swarmLoading: boolean;
  swarmSaving: boolean;
  swarmError: string | null;
  swarmTeams: SwarmTeamDefinition[];
  swarmSelectedTeamId: string | null;
  swarmForm: SwarmFormState;
  swarmIdentity: EnterpriseIdentityInput;
};

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeWorker(worker: SwarmWorkerForm): SwarmWorkerMember | null {
  const agentId = worker.agentId.trim();
  if (!agentId) {
    return null;
  }
  const displayName = worker.displayName.trim() || undefined;
  const specialties = parseCsv(worker.specialties);
  const allowedScopes = parseCsv(worker.allowedScopes);
  return {
    agentId,
    displayName,
    specialties: specialties.length > 0 ? specialties : undefined,
    allowedScopes: allowedScopes.length > 0 ? allowedScopes : undefined,
  };
}

function teamToForm(team: SwarmTeamDefinition): SwarmFormState {
  return {
    teamId: team.teamId,
    supervisorAgentId: team.supervisorAgentId,
    workers: team.workers.map((worker) => ({
      agentId: worker.agentId,
      displayName: worker.displayName ?? "",
      specialties: worker.specialties?.join(", ") ?? "",
      allowedScopes: worker.allowedScopes?.join(", ") ?? "",
    })),
  };
}

function createIdentity(state: SwarmState) {
  const tenantId = state.swarmIdentity.tenantId.trim();
  const requesterId = state.swarmIdentity.requesterId.trim();
  const scopes = parseCsv(state.swarmIdentity.scopes);
  if (!tenantId || !requesterId) {
    throw new Error("Tenant e requester são obrigatórios para operações de swarm.");
  }
  return {
    tenantId,
    requesterId,
    role: state.swarmIdentity.role,
    scopes,
  };
}

export function createDefaultSwarmForm(supervisorAgentId = ""): SwarmFormState {
  return {
    teamId: "",
    supervisorAgentId,
    workers: [],
  };
}

export function resetSwarmForm(state: SwarmState, supervisorAgentId: string) {
  state.swarmSelectedTeamId = null;
  state.swarmForm = createDefaultSwarmForm(supervisorAgentId);
}

export function setSwarmIdentityField<K extends keyof EnterpriseIdentityInput>(
  state: SwarmState,
  key: K,
  value: EnterpriseIdentityInput[K],
) {
  state.swarmIdentity = { ...state.swarmIdentity, [key]: value };
}

export function setSwarmFormField<K extends keyof SwarmFormState>(
  state: SwarmState,
  key: K,
  value: SwarmFormState[K],
) {
  state.swarmForm = { ...state.swarmForm, [key]: value };
}

export function addSwarmWorker(state: SwarmState) {
  state.swarmForm = {
    ...state.swarmForm,
    workers: [
      ...state.swarmForm.workers,
      { agentId: "", displayName: "", specialties: "", allowedScopes: "" },
    ],
  };
}

export function removeSwarmWorker(state: SwarmState, index: number) {
  state.swarmForm = {
    ...state.swarmForm,
    workers: state.swarmForm.workers.filter((_, idx) => idx !== index),
  };
}

export function updateSwarmWorkerField<K extends keyof SwarmWorkerForm>(
  state: SwarmState,
  index: number,
  key: K,
  value: SwarmWorkerForm[K],
) {
  const next = [...state.swarmForm.workers];
  if (!next[index]) {
    return;
  }
  next[index] = { ...next[index], [key]: value };
  state.swarmForm = { ...state.swarmForm, workers: next };
}

export async function loadSwarmTeams(state: SwarmState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.swarmLoading) {
    return;
  }
  state.swarmLoading = true;
  state.swarmError = null;
  try {
    const identity = createIdentity(state);
    const res = await state.client.request<{ teams?: SwarmTeamDefinition[] }>("swarm.team.list", {
      tenantId: identity.tenantId,
      identity,
    });
    state.swarmTeams = Array.isArray(res.teams) ? res.teams : [];
  } catch (err) {
    state.swarmError = String(err);
  } finally {
    state.swarmLoading = false;
  }
}

export function selectSwarmTeam(state: SwarmState, teamId: string, supervisorAgentId: string) {
  const selected = state.swarmTeams.find((team) => team.teamId === teamId) ?? null;
  if (!selected) {
    resetSwarmForm(state, supervisorAgentId);
    return;
  }
  state.swarmSelectedTeamId = selected.teamId;
  state.swarmForm = teamToForm(selected);
}

export async function upsertSwarmTeam(state: SwarmState) {
  if (!state.client || !state.connected || state.swarmSaving) {
    return;
  }
  state.swarmSaving = true;
  state.swarmError = null;
  try {
    const identity = createIdentity(state);
    const teamId = state.swarmForm.teamId.trim();
    const supervisorAgentId = state.swarmForm.supervisorAgentId.trim();
    if (!teamId || !supervisorAgentId) {
      throw new Error("Team ID e Supervisor são obrigatórios.");
    }
    const workers = state.swarmForm.workers.map(normalizeWorker).filter(Boolean);
    const res = await state.client.request<{ team?: SwarmTeamDefinition }>("swarm.team.upsert", {
      tenantId: identity.tenantId,
      identity,
      team: {
        teamId,
        supervisorAgentId,
        workers,
      },
    });
    const saved = res.team;
    if (saved) {
      const list = state.swarmTeams.filter((entry) => entry.teamId !== saved.teamId);
      state.swarmTeams = [...list, saved].sort((a, b) => a.teamId.localeCompare(b.teamId));
      state.swarmSelectedTeamId = saved.teamId;
      state.swarmForm = teamToForm(saved);
    } else {
      await loadSwarmTeams(state);
    }
  } catch (err) {
    state.swarmError = String(err);
  } finally {
    state.swarmSaving = false;
  }
}

export async function deleteSwarmTeam(state: SwarmState, teamId: string, supervisorAgentId: string) {
  if (!state.client || !state.connected || state.swarmSaving) {
    return;
  }
  state.swarmSaving = true;
  state.swarmError = null;
  try {
    const identity = createIdentity(state);
    await state.client.request("swarm.team.delete", {
      tenantId: identity.tenantId,
      identity,
      teamId,
    });
    state.swarmTeams = state.swarmTeams.filter((entry) => entry.teamId !== teamId);
    if (state.swarmSelectedTeamId === teamId) {
      resetSwarmForm(state, supervisorAgentId);
    }
  } catch (err) {
    state.swarmError = String(err);
  } finally {
    state.swarmSaving = false;
  }
}
