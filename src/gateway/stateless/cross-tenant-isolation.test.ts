import { describe, expect, it } from "vitest";
import { InMemorySwarmDirectoryStore } from "./adapters/in-memory/in-memory-swarm-directory-store.js";
import { InMemorySessionStateStore } from "./adapters/in-memory/in-memory-session-state-store.js";
import { InMemoryMemoryStore } from "./adapters/in-memory/in-memory-memory-store.js";
import { InMemorySchedulerOrchestrator } from "./adapters/in-memory/in-memory-scheduler-orchestrator.js";
import { authorizeEnterpriseScope } from "./enterprise-authorization.js";
import { authorizeSchedulerAction } from "./scheduler-policy.js";

describe("cross-tenant isolation", () => {
  describe("swarm directory", () => {
    it("tenant A cannot read tenant B swarm teams", async () => {
      const store = new InMemorySwarmDirectoryStore();

      await store.upsert({
        tenantId: "tenant-a",
        teamId: "team-alpha",
        supervisorAgentId: "super-a",
        workers: [{ agentId: "worker-a1" }],
        updatedAtEpochMs: Date.now(),
      });

      await store.upsert({
        tenantId: "tenant-b",
        teamId: "team-beta",
        supervisorAgentId: "super-b",
        workers: [{ agentId: "worker-b1" }],
        updatedAtEpochMs: Date.now(),
      });

      const listA = await store.list({ tenantId: "tenant-a" });
      expect(listA).toHaveLength(1);
      expect(listA[0].teamId).toBe("team-alpha");

      const listB = await store.list({ tenantId: "tenant-b" });
      expect(listB).toHaveLength(1);
      expect(listB[0].teamId).toBe("team-beta");

      // Cross-tenant get returns null
      const cross = await store.get({ tenantId: "tenant-a", teamId: "team-beta" });
      expect(cross).toBeNull();
    });

    it("tenant A cannot delete tenant B teams", async () => {
      const store = new InMemorySwarmDirectoryStore();

      await store.upsert({
        tenantId: "tenant-b",
        teamId: "team-beta",
        supervisorAgentId: "super-b",
        workers: [],
        updatedAtEpochMs: Date.now(),
      });

      const deleted = await store.delete({ tenantId: "tenant-a", teamId: "team-beta" });
      expect(deleted).toBe(false);

      const still = await store.get({ tenantId: "tenant-b", teamId: "team-beta" });
      expect(still).not.toBeNull();
    });
  });

  describe("session state store", () => {
    it("tenant A cannot list tenant B sessions", async () => {
      const store = new InMemorySessionStateStore();

      await store.upsert({
        scope: { tenantId: "tenant-a", agentId: "agent-1", sessionKey: "sess-a" },
        sessionId: "sess-a",
        updatedAt: Date.now(),
      });

      await store.upsert({
        scope: { tenantId: "tenant-b", agentId: "agent-1", sessionKey: "sess-b" },
        sessionId: "sess-b",
        updatedAt: Date.now(),
      });

      const listA = await store.listByTenant("tenant-a");
      expect(listA).toHaveLength(1);
      expect(listA[0].sessionId).toBe("sess-a");

      const listB = await store.listByTenant("tenant-b");
      expect(listB).toHaveLength(1);
      expect(listB[0].sessionId).toBe("sess-b");
    });

    it("tenant A cannot get tenant B session by scope", async () => {
      const store = new InMemorySessionStateStore();

      await store.upsert({
        scope: { tenantId: "tenant-b", agentId: "agent-1", sessionKey: "sess-b" },
        sessionId: "sess-b",
        updatedAt: Date.now(),
      });

      const cross = await store.get({
        tenantId: "tenant-a",
        agentId: "agent-1",
        sessionKey: "sess-b",
      });
      expect(cross).toBeNull();
    });
  });

  describe("memory store", () => {
    it("tenant A cannot list tenant B memory entries", async () => {
      const store = new InMemoryMemoryStore();

      await store.append({
        id: "mem-1",
        scope: { tenantId: "tenant-a", agentId: "agent-1", sessionKey: "sess-a" },
        role: "user",
        content: "hello from tenant A",
        timestamp: Date.now(),
      });

      await store.append({
        id: "mem-2",
        scope: { tenantId: "tenant-b", agentId: "agent-1", sessionKey: "sess-b" },
        role: "user",
        content: "hello from tenant B",
        timestamp: Date.now(),
      });

      const listA = await store.list({
        tenantId: "tenant-a",
        agentId: "agent-1",
        sessionKey: "sess-a",
      });
      expect(listA).toHaveLength(1);
      expect(listA[0].content).toBe("hello from tenant A");

      // Trying to access tenant B's session from tenant A's scope returns empty
      const cross = await store.list({
        tenantId: "tenant-a",
        agentId: "agent-1",
        sessionKey: "sess-b",
      });
      expect(cross).toHaveLength(0);
    });
  });

  describe("enterprise authorization", () => {
    it("denies cross-tenant scope authorization", () => {
      const result = authorizeEnterpriseScope({
        identity: {
          tenantId: "tenant-a",
          requesterId: "user-1",
          role: "admin",
          scopes: ["swarm:read", "swarm:write"],
        },
        requiredScope: "swarm:read",
        tenantId: "tenant-b",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CROSS_TENANT_FORBIDDEN");
      }
    });
  });

  describe("scheduler policy", () => {
    it("denies cross-tenant scheduling for supervisor", () => {
      const result = authorizeSchedulerAction({
        input: {
          tenantId: "tenant-a",
          targetTenantId: "tenant-b",
          callerAgentId: "super-1",
          callerRole: "supervisor",
          targetAgentId: "worker-1",
        },
        teams: new Map(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CROSS_TENANT_FORBIDDEN");
      }
    });

    it("denies cross-tenant scheduling for worker", () => {
      const result = authorizeSchedulerAction({
        input: {
          tenantId: "tenant-a",
          targetTenantId: "tenant-b",
          callerAgentId: "worker-1",
          callerRole: "worker",
          targetAgentId: "worker-1",
        },
        teams: new Map(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CROSS_TENANT_FORBIDDEN");
      }
    });

    it("worker cannot schedule for another agent even in same tenant", () => {
      const result = authorizeSchedulerAction({
        input: {
          tenantId: "tenant-a",
          targetTenantId: "tenant-a",
          callerAgentId: "worker-1",
          callerRole: "worker",
          targetAgentId: "worker-2",
        },
        teams: new Map(),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("SCHEDULE_FORBIDDEN");
      }
    });
  });
});
