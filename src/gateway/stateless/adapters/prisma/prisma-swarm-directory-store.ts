import type { SwarmTeamDefinition } from "../../contracts/enterprise-orchestration.js";
import type { SwarmDirectoryStore } from "../../contracts/swarm-directory-store.js";
import { withTenantScope } from "./prisma-tenant-client.js";

export class PrismaSwarmDirectoryStore implements SwarmDirectoryStore {
  async upsert(team: SwarmTeamDefinition): Promise<SwarmTeamDefinition> {
    return withTenantScope(team.tenantId, async (tx) => {
      const upserted = await tx.swarmTeam.upsert({
        where: { tenantId_name: { tenantId: team.tenantId, name: team.teamId } },
        create: {
          tenantId: team.tenantId,
          name: team.teamId,
          managerId: team.supervisorAgentId,
        },
        update: {
          managerId: team.supervisorAgentId,
        },
        include: { members: true },
      });

      // Recreate memberships
      await tx.swarmMembership.deleteMany({
        where: { teamId: upserted.id, tenantId: team.tenantId },
      });

      if (team.workers.length > 0) {
        await tx.swarmMembership.createMany({
          data: team.workers.map((w) => ({
            teamId: upserted.id,
            tenantId: team.tenantId,
            workerId: w.agentId,
          })),
        });
      }

      return toDefinition(team.tenantId, upserted, team.workers);
    });
  }

  async get(params: { tenantId: string; teamId: string }): Promise<SwarmTeamDefinition | null> {
    return withTenantScope(params.tenantId, async (tx) => {
      const team = await tx.swarmTeam.findUnique({
        where: { tenantId_name: { tenantId: params.tenantId, name: params.teamId } },
        include: { members: true },
      });
      if (!team) return null;
      return toDefinition(params.tenantId, team, team.members.map((m) => ({ agentId: m.workerId })));
    });
  }

  async list(params: { tenantId: string }): Promise<SwarmTeamDefinition[]> {
    return withTenantScope(params.tenantId, async (tx) => {
      const teams = await tx.swarmTeam.findMany({
        where: { tenantId: params.tenantId },
        include: { members: true },
        orderBy: { name: "asc" },
      });
      return teams.map((t) =>
        toDefinition(params.tenantId, t, t.members.map((m) => ({ agentId: m.workerId }))),
      );
    });
  }

  async delete(params: { tenantId: string; teamId: string }): Promise<boolean> {
    return withTenantScope(params.tenantId, async (tx) => {
      const existing = await tx.swarmTeam.findUnique({
        where: { tenantId_name: { tenantId: params.tenantId, name: params.teamId } },
      });
      if (!existing) return false;
      await tx.swarmTeam.delete({ where: { id: existing.id } });
      return true;
    });
  }
}

function toDefinition(
  tenantId: string,
  team: { id: string; name: string; managerId: string },
  workers: { agentId: string }[],
): SwarmTeamDefinition {
  return {
    tenantId,
    teamId: team.name,
    supervisorAgentId: team.managerId,
    workers: workers.map((w) => ({ agentId: w.agentId })),
    updatedAtEpochMs: Date.now(),
  };
}
