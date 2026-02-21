import type { SwarmTeamDefinition } from "../../contracts/enterprise-orchestration.js";
import type { SwarmDirectoryStore } from "../../contracts/swarm-directory-store.js";

function teamKey(params: { tenantId: string; teamId: string }): string {
  return `${params.tenantId}:${params.teamId}`;
}

export class InMemorySwarmDirectoryStore implements SwarmDirectoryStore {
  private readonly teams = new Map<string, SwarmTeamDefinition>();

  async upsert(team: SwarmTeamDefinition): Promise<SwarmTeamDefinition> {
    const normalized: SwarmTeamDefinition = {
      ...team,
      updatedAtEpochMs: team.updatedAtEpochMs || Date.now(),
      workers: Array.isArray(team.workers) ? [...team.workers] : [],
    };
    this.teams.set(teamKey(team), normalized);
    return normalized;
  }

  async get(params: { tenantId: string; teamId: string }): Promise<SwarmTeamDefinition | null> {
    return this.teams.get(teamKey(params)) ?? null;
  }

  async list(params: { tenantId: string }): Promise<SwarmTeamDefinition[]> {
    const out: SwarmTeamDefinition[] = [];
    for (const entry of this.teams.values()) {
      if (entry.tenantId === params.tenantId) {
        out.push(entry);
      }
    }
    return out.toSorted((a, b) => a.teamId.localeCompare(b.teamId));
  }

  async delete(params: { tenantId: string; teamId: string }): Promise<boolean> {
    return this.teams.delete(teamKey(params));
  }
}

