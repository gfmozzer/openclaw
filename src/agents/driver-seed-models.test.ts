import { describe, expect, it } from "vitest";
import { buildDriverSeedModels } from "./driver-seed-models.js";

describe("buildDriverSeedModels", () => {
  it("adds fal tool-mode seed models when fal driver is enabled", () => {
    const models = buildDriverSeedModels({
      OPENCLAW_DRIVER_FAL_ENABLED: "1",
    });
    expect(models.some((m) => m.driverId === "fal" && m.provider === "fal")).toBe(true);
    expect(models.every((m) => m.driverId !== "fal" || m.toolMode === true)).toBe(true);
  });

  it("adds azure deployment seed when azure driver and deployment are configured", () => {
    const models = buildDriverSeedModels({
      OPENCLAW_DRIVER_AZURE_ENABLED: "1",
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o-prod",
    });
    expect(models).toContainEqual(
      expect.objectContaining({
        id: "gpt-4o-prod",
        provider: "azure-openai",
        driverId: "azure",
      }),
    );
  });
});

