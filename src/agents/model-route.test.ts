import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRIVER_ID,
  formatModelRoute,
  modelRouteKey,
  parseModelRouteRef,
  toLegacyModelRef,
  toModelRouteRef,
} from "./model-route.js";

describe("model-route", () => {
  it("parses explicit driver::provider/model route", () => {
    const parsed = parseModelRouteRef({
      raw: "litellm::openai/gpt-5.2",
      defaultProvider: "anthropic",
    });
    expect(parsed).toEqual({
      driver: "litellm",
      provider: "openai",
      model: "gpt-5.2",
    });
  });

  it("parses legacy provider/model route with default native driver", () => {
    const parsed = parseModelRouteRef({
      raw: "openai/gpt-5.2",
      defaultProvider: "anthropic",
    });
    expect(parsed).toEqual({
      driver: DEFAULT_DRIVER_ID,
      provider: "openai",
      model: "gpt-5.2",
    });
  });

  it("parses legacy model-only route using default provider", () => {
    const parsed = parseModelRouteRef({
      raw: "claude-opus-4-6",
      defaultProvider: "anthropic",
    });
    expect(parsed).toEqual({
      driver: DEFAULT_DRIVER_ID,
      provider: "anthropic",
      model: "claude-opus-4-6",
    });
  });

  it("formats native routes as legacy by default", () => {
    const route = toModelRouteRef({
      provider: "openai",
      model: "gpt-5.2",
    });
    expect(formatModelRoute(route)).toBe("openai/gpt-5.2");
    expect(formatModelRoute(route, { includeNativeDriver: true })).toBe("native::openai/gpt-5.2");
    expect(modelRouteKey(route)).toBe("native::openai/gpt-5.2");
  });

  it("converts back to legacy model ref", () => {
    const route = toModelRouteRef({
      driver: "fal",
      provider: "fal",
      model: "fal-ai/kling-video/v2/master",
    });
    expect(toLegacyModelRef(route)).toEqual({
      provider: "fal",
      model: "fal-ai/kling-video/v2/master",
    });
  });
});
