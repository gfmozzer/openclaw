import { describe, expect, it } from "vitest";
import { parseModelRef } from "./model-selection.js";

describe("model-selection route compatibility", () => {
  it("accepts canonical driver::provider/model route in parseModelRef", () => {
    expect(parseModelRef("litellm::openai/gpt-5.2", "anthropic")).toEqual({
      provider: "openai",
      model: "gpt-5.2",
    });
  });

  it("keeps nested model IDs when canonical route is used", () => {
    expect(parseModelRef("fal::fal/fal-ai/kling-video/v2/master", "anthropic")).toEqual({
      provider: "fal",
      model: "fal-ai/kling-video/v2/master",
    });
  });
});
