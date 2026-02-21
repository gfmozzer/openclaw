import type { SwarmTeamDefinition } from "./enterprise-orchestration.js";

export interface SwarmDirectoryStore {
  upsert(team: SwarmTeamDefinition): Promise<SwarmTeamDefinition>;
  get(params: { tenantId: string; teamId: string }): Promise<SwarmTeamDefinition | null>;
  list(params: { tenantId: string }): Promise<SwarmTeamDefinition[]>;
  delete(params: { tenantId: string; teamId: string }): Promise<boolean>;
}

