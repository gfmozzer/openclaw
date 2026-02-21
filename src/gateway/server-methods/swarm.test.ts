import { describe, expect, it, vi } from "vitest";
import { InMemorySwarmDirectoryStore } from "../stateless/adapters/in-memory/in-memory-swarm-directory-store.js";
import { swarmHandlers } from "./swarm.js";
import type { GatewayRequestContext } from "./types.js";

function createContext(): GatewayRequestContext {
  return {
    swarmDirectoryStore: new InMemorySwarmDirectoryStore(),
  } as unknown as GatewayRequestContext;
}

function validIdentity() {
  return {
    tenantId: "tenant-a",
    requesterId: "req-1",
    role: "admin",
    scopes: ["swarm:read", "swarm:write"],
  };
}

describe("swarm handlers", () => {
  it("upserts and fetches a team", async () => {
    const context = createContext();
    const respondUpsert = vi.fn();
    await swarmHandlers["swarm.team.upsert"]({
      params: {
        identity: validIdentity(),
        team: {
          teamId: "sales",
          supervisorAgentId: "supervisor-1",
          workers: [{ agentId: "worker-1", specialties: ["relatorios"] }],
        },
      },
      respond: respondUpsert,
      context,
      client: null,
      req: { type: "req", id: "1", method: "swarm.team.upsert" },
      isWebchatConnect: () => false,
    });

    expect(respondUpsert).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        team: expect.objectContaining({ teamId: "sales" }),
      }),
      undefined,
    );

    const respondGet = vi.fn();
    await swarmHandlers["swarm.team.get"]({
      params: {
        identity: validIdentity(),
        teamId: "sales",
      },
      respond: respondGet,
      context,
      client: null,
      req: { type: "req", id: "2", method: "swarm.team.get" },
      isWebchatConnect: () => false,
    });
    expect(respondGet).toHaveBeenCalledWith(
      true,
      {
        team: expect.objectContaining({
          teamId: "sales",
          supervisorAgentId: "supervisor-1",
        }),
      },
      undefined,
    );
  });

  it("denies write when missing scope", async () => {
    const context = createContext();
    const respond = vi.fn();
    await swarmHandlers["swarm.team.upsert"]({
      params: {
        identity: {
          tenantId: "tenant-a",
          requesterId: "req-1",
          role: "worker",
          scopes: ["swarm:read"],
        },
        team: {
          teamId: "sales",
          supervisorAgentId: "supervisor-1",
          workers: [],
        },
      },
      respond,
      context,
      client: null,
      req: { type: "req", id: "3", method: "swarm.team.upsert" },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});

