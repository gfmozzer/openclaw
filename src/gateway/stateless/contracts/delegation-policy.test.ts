import { describe, expect, it } from "vitest";
import {
  createDefaultDelegationPolicy,
  DEFAULT_DELEGATION_POLICY_CONFIG,
  type DelegationPermissionInput,
} from "./delegation-policy.js";
import type { EnterpriseRole } from "./enterprise-orchestration.js";

describe("delegation-policy", () => {
  const createMockTeamLookup = (agentTeams: Map<string, string>) => ({
    isWorkerInTeam: (workerAgentId: string, teamId: string) => {
      return agentTeams.get(workerAgentId) === teamId;
    },
    getWorkerTeam: (agentId: string) => {
      return agentTeams.get(agentId);
    },
  });

  describe("supervisor role", () => {
    it("should allow supervisor to delegate to worker in their team", () => {
      // supervisor-1 e worker-1 estão ambos na team-a
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map([
          ["supervisor-1", "team-a"],
          ["worker-1", "team-a"],
        ])),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "supervisor-1",
          role: "supervisor" as EnterpriseRole,
          scopes: ["jobs:schedule:team"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
          teamId: "team-a",
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: false,
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(true);
    });

    it("should deny supervisor to delegate to worker not in their team", () => {
      // supervisor-1 está na team-a, mas worker-1 está na team-b
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map([
          ["supervisor-1", "team-a"],
          ["worker-1", "team-b"],
        ])),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "supervisor-1",
          role: "supervisor" as EnterpriseRole,
          scopes: ["jobs:schedule:team"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
          teamId: "team-b",
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: false,
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.errorCode).toBe("WORKER_NOT_IN_TEAM");
      }
    });

    it("should allow supervisor to schedule for team", () => {
      // supervisor-1 e worker-1 estão na mesma team
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map([
          ["supervisor-1", "team-a"],
          ["worker-1", "team-a"],
        ])),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "supervisor-1",
          role: "supervisor" as EnterpriseRole,
          scopes: ["jobs:schedule:team"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: true,
        scheduleTarget: "team",
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(true);
    });
  });

  describe("worker role", () => {
    it("should deny worker from delegating to another worker", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "worker-1",
          role: "worker" as EnterpriseRole,
          scopes: ["jobs:schedule:self"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-2",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: false,
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.errorCode).toBe("WORKER_CANNOT_DELEGATE");
      }
    });

    it("should allow worker to schedule for self", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "worker-1",
          role: "worker" as EnterpriseRole,
          scopes: ["jobs:schedule:self"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: true,
        scheduleTarget: "self",
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(true);
    });

    it("should deny worker from scheduling for team", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "worker-1",
          role: "worker" as EnterpriseRole,
          scopes: ["jobs:schedule:self"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-2",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: true,
        scheduleTarget: "team",
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.errorCode).toBe("SCHEDULE_TEAM_DENIED");
      }
    });
  });

  describe("admin role", () => {
    it("should allow admin to delegate to any worker in tenant", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map([["worker-1", "team-a"]])),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "admin-1",
          role: "admin" as EnterpriseRole,
          scopes: ["jobs:schedule:team", "swarm:write"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
          teamId: "team-a",
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: false,
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(true);
    });

    it("should allow admin to schedule for team", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "admin-1",
          role: "admin" as EnterpriseRole,
          scopes: ["jobs:schedule:team"],
        },
        targetWorker: {
          tenantId: "tenant-1",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: true,
        scheduleTarget: "team",
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(true);
    });
  });

  describe("cross-tenant delegation", () => {
    it("should deny cross-tenant delegation", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const input: DelegationPermissionInput = {
        delegatedBy: {
          tenantId: "tenant-1",
          principalId: "supervisor-1",
          role: "supervisor" as EnterpriseRole,
          scopes: ["jobs:schedule:team"],
        },
        targetWorker: {
          tenantId: "tenant-2",
          agentId: "worker-1",
          role: "worker" as EnterpriseRole,
        },
        taskContext: {
          taskType: "test-task",
        },
        isScheduling: false,
      };

      const result = policy.checkPermission(input);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.errorCode).toBe("CROSS_TENANT_DELEGATION_FORBIDDEN");
      }
    });
  });

  describe("scope intersection", () => {
    it("should compute scope intersection correctly", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const result = policy.computeEffectiveScopes(
        ["jobs:schedule:self", "jobs:schedule:team", "swarm:read"],
        ["jobs:schedule:self", "swarm:read"],
      );

      expect(result).toEqual(["jobs:schedule:self", "swarm:read"]);
    });

    it("should return delegator scopes when target has no scopes", () => {
      const policy = createDefaultDelegationPolicy(
        DEFAULT_DELEGATION_POLICY_CONFIG,
        createMockTeamLookup(new Map()),
      );

      const result = policy.computeEffectiveScopes(
        ["jobs:schedule:self", "swarm:read"],
        [],
      );

      expect(result).toEqual(["jobs:schedule:self", "swarm:read"]);
    });
  });
});
