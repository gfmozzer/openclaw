import { describe, expect, it } from "vitest";
import { extractRichEnvelopes } from "./rich-blocks.ts";

describe("extractRichEnvelopes", () => {
  it("ignores regular text content blocks", () => {
    const envelopes = extractRichEnvelopes({
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
    });
    expect(envelopes).toHaveLength(0);
  });

  it("parses rich envelope from JSON text block", () => {
    const envelopes = extractRichEnvelopes({
      role: "assistant",
      content: [{ type: "text", text: '{"type":"table","data":{"columns":["A"],"rows":[[1]]}}' }],
    });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.type).toBe("table");
  });

  it("parses direct rich action block", () => {
    const envelopes = extractRichEnvelopes({
      role: "assistant",
      content: [{ type: "actions", data: { actions: [{ label: "Run" }] } }],
    });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.type).toBe("actions");
  });
});
