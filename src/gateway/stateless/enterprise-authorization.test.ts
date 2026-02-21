import { describe, expect, it } from "vitest";
import { authorizeEnterpriseScope } from "./enterprise-authorization.js";
import type { EnterpriseIdentity, EnterpriseScope } from "./contracts/enterprise-orchestration.js";

function makeIdentity(
  tenantId: string,
  scopes: EnterpriseScope[],
): EnterpriseIdentity {
  return {
    tenantId,
    requesterId: "user-1",
    role: "admin",
    scopes,
  };
}

describe("authorizeEnterpriseScope", () => {
  it("allows access with correct tenant and scope", () => {
    const result = authorizeEnterpriseScope({
      identity: makeIdentity("tenant-a", ["swarm:read"]),
      requiredScope: "swarm:read",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(true);
  });

  it("denies access when identity is null", () => {
    const result = authorizeEnterpriseScope({
      identity: null,
      requiredScope: "swarm:read",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAUTHORIZED_REQUESTER");
    }
  });

  it("denies access when identity is undefined", () => {
    const result = authorizeEnterpriseScope({
      identity: undefined,
      requiredScope: "swarm:read",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAUTHORIZED_REQUESTER");
    }
  });

  it("denies cross-tenant access", () => {
    const result = authorizeEnterpriseScope({
      identity: makeIdentity("tenant-a", ["swarm:read", "swarm:write"]),
      requiredScope: "swarm:read",
      tenantId: "tenant-b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CROSS_TENANT_FORBIDDEN");
      expect(result.error.details).toEqual({
        requesterTenantId: "tenant-a",
        targetTenantId: "tenant-b",
      });
    }
  });

  it("denies access when required scope is missing", () => {
    const result = authorizeEnterpriseScope({
      identity: makeIdentity("tenant-a", ["swarm:read"]),
      requiredScope: "swarm:write",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN_SCOPE");
      expect(result.error.details).toEqual({ requiredScope: "swarm:write" });
    }
  });

  it("denies access with empty scopes", () => {
    const result = authorizeEnterpriseScope({
      identity: makeIdentity("tenant-a", []),
      requiredScope: "jobs:schedule:self",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN_SCOPE");
    }
  });

  it("allows multiple scopes when required one is present", () => {
    const result = authorizeEnterpriseScope({
      identity: makeIdentity("tenant-a", [
        "swarm:read",
        "swarm:write",
        "jobs:schedule:self",
        "memory:read:self",
      ]),
      requiredScope: "memory:read:self",
      tenantId: "tenant-a",
    });
    expect(result.ok).toBe(true);
  });
});
