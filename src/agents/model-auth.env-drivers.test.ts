import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEnvApiKey } from "./model-auth.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveEnvApiKey driver-oriented providers", () => {
  it("resolves fal via FAL_KEY", () => {
    vi.stubEnv("FAL_KEY", "fal_test_key");
    const resolved = resolveEnvApiKey("fal");
    expect(resolved?.apiKey).toBe("fal_test_key");
  });

  it("resolves azure-openai via AZURE_OPENAI_API_KEY", () => {
    vi.stubEnv("AZURE_OPENAI_API_KEY", "azure_test_key");
    const resolved = resolveEnvApiKey("azure-openai");
    expect(resolved?.apiKey).toBe("azure_test_key");
  });
});

