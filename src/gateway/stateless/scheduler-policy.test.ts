import { describe, expect, it } from "vitest";
import {
  authorizeSchedulerAction,
  resolveSchedulerTeamMapFromEnv,
} from "./scheduler-policy.js";

describe("scheduler policy", () => {
  it("allows worker scheduling only for self", () => {
    const teams = new Map();
    const self = authorizeSchedulerAction({
      input: {
        tenantId: "tenant-a",
        targetTenantId: "tenant-a",
        callerAgentId: "worker-1",
        callerRole: "worker",
        targetAgentId: "worker-1",
      },
      teams,
    });
    expect(self).toEqual({ ok: true });

    const peer = authorizeSchedulerAction({
      input: {
        tenantId: "tenant-a",
        targetTenantId: "tenant-a",
        callerAgentId: "worker-1",
        callerRole: "worker",
        targetAgentId: "worker-2",
      },
      teams,
    });
    expect(peer).toEqual({
      ok: false,
      code: "SCHEDULE_FORBIDDEN",
      message: "worker can only schedule jobs for self",
    });
  });

  it("allows supervisor scheduling for workers on team", () => {
    const teams = resolveSchedulerTeamMapFromEnv({
      OPENCLAW_TEMPORAL_TEAM_MAP_JSON:
        '{"tenant-a":{"super-1":["worker-1","worker-2"]},"tenant-b":{"super-9":["worker-9"]}}',
    });
    const allowed = authorizeSchedulerAction({
      input: {
        tenantId: "tenant-a",
        targetTenantId: "tenant-a",
        callerAgentId: "super-1",
        callerRole: "supervisor",
        targetAgentId: "worker-2",
      },
      teams,
    });
    expect(allowed).toEqual({ ok: true });
  });

  it("denies supervisor when target is outside team", () => {
    const teams = resolveSchedulerTeamMapFromEnv({
      OPENCLAW_TEMPORAL_TEAM_MAP_JSON: '{"tenant-a":{"super-1":["worker-1"]}}',
    });
    const denied = authorizeSchedulerAction({
      input: {
        tenantId: "tenant-a",
        targetTenantId: "tenant-a",
        callerAgentId: "super-1",
        callerRole: "supervisor",
        targetAgentId: "worker-2",
      },
      teams,
    });
    expect(denied).toEqual({
      ok: false,
      code: "TARGET_NOT_IN_TEAM",
      message: "target agent is not part of supervisor team",
    });
  });

  it("denies cross-tenant scheduling", () => {
    const teams = resolveSchedulerTeamMapFromEnv({
      OPENCLAW_TEMPORAL_TEAM_MAP_JSON: '{"tenant-a":{"super-1":["worker-1"]}}',
    });
    const denied = authorizeSchedulerAction({
      input: {
        tenantId: "tenant-a",
        targetTenantId: "tenant-b",
        callerAgentId: "super-1",
        callerRole: "supervisor",
        targetAgentId: "worker-1",
      },
      teams,
    });
    expect(denied).toEqual({
      ok: false,
      code: "CROSS_TENANT_FORBIDDEN",
      message: "cross-tenant scheduling is forbidden",
    });
  });
});
