import { describe, expect, it } from "vitest";
import {
  mapEnterpriseIdentityToPrincipalRef,
  normalizeRequestSource,
  resolveDefaultRequestSource,
} from "./contracts/request-context-contract.js";

describe("request-context-contract", () => {
  it("normalizes supported request sources", () => {
    expect(normalizeRequestSource("channel_direct")).toBe("channel_direct");
    expect(normalizeRequestSource("trusted_frontdoor_api")).toBe("trusted_frontdoor_api");
    expect(normalizeRequestSource("invalid")).toBeUndefined();
  });

  it("resolves default request source from gateway client role/method", () => {
    expect(
      resolveDefaultRequestSource({
        client: { connect: { role: "node" } },
        method: "chat.send",
      }),
    ).toBe("internal_supervisor");

    expect(
      resolveDefaultRequestSource({
        client: { connect: { role: "operator" } },
        method: "chat.send",
      }),
    ).toBe("operator_ui");
  });

  it("maps enterprise identity to principal ref", () => {
    expect(
      mapEnterpriseIdentityToPrincipalRef({
        tenantId: "tenant-a",
        requesterId: "user-1",
        role: "supervisor",
        scopes: ["swarm:read"],
      }),
    ).toEqual({
      tenantId: "tenant-a",
      principalId: "user-1",
      role: "supervisor",
      scopes: ["swarm:read"],
    });
  });
});

