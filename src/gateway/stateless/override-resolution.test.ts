import { describe, expect, it } from "vitest";
import { resolveOverrideResolution, sanitizeOverridePatch } from "./contracts/override-resolution.js";

describe("sanitizeOverridePatch", () => {
  it("returns undefined for empty payload", () => {
    expect(sanitizeOverridePatch({})).toBeUndefined();
    expect(sanitizeOverridePatch(null)).toBeUndefined();
  });

  it("sanitizes known override fields including optimization hints", () => {
    const patch = sanitizeOverridePatch({
      provider: " openai ",
      model: " gpt-4o-mini ",
      skillAllowlist: [" reports ", "", 123, "search"],
      optimizationMode: "economy",
      contextPolicy: "lean",
      routingHints: { preferCheap: true, preferFast: false },
      budgetPolicyRef: " tenant-budget ",
    });
    expect(patch).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      skillAllowlist: ["reports", "search"],
      optimizationMode: "economy",
      contextPolicy: "lean",
      budgetPolicyRef: "tenant-budget",
    });
  });
});

describe("resolveOverrideResolution", () => {
  it("applies fallback defaults for optimization when absent", () => {
    const res = resolveOverrideResolution({
      requestSource: "operator_ui",
    });
    expect(res.origin).toBe("operator_ui");
    expect(res.optimization.effectiveOptimizationMode).toBe("balanced");
    expect(res.optimization.effectiveContextPolicy).toBe("standard");
  });

  it("intersects skillAllowlist with agent defaults and policy", () => {
    const res = resolveOverrideResolution({
      requestPatch: { skillAllowlist: ["finance", "search", "other"] },
      agentDefaults: { skillAllowlist: ["finance", "search"] },
      policy: { allowedSkills: ["search"] },
    });
    expect(res.effectiveSkillAllowlist).toEqual(["search"]);
    expect(res.capability.rejectedSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: "finance" }),
        expect.objectContaining({ skillId: "other" }),
      ]),
    );
  });

  it("preserves requested optimization values when present", () => {
    const res = resolveOverrideResolution({
      requestPatch: { optimizationMode: "economy", contextPolicy: "lean" },
      agentDefaults: { optimizationMode: "quality", contextPolicy: "full" },
    });
    expect(res.optimization.effectiveOptimizationMode).toBe("economy");
    expect(res.optimization.effectiveContextPolicy).toBe("lean");
    expect(res.effectiveConfig.optimizationMode).toBe("economy");
    expect(res.effectiveConfig.contextPolicy).toBe("lean");
  });
});

