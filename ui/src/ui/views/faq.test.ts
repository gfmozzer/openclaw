import { render } from "lit";
import { describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderFaqView } from "./faq.ts";

describe("faq view", () => {
  it("renders core operational questions", async () => {
    await i18n.setLocale("en");
    const container = document.createElement("div");
    render(renderFaqView(), container);

    expect(container.textContent).toContain("Operational FAQ");
    expect(container.textContent).toContain("How do I connect WhatsApp?");
    expect(container.textContent).toContain("How do I connect Telegram?");
    expect(container.textContent).toContain("How do I register a worker and link it to a swarm?");
    expect(container.textContent).toContain("How do I validate stack");
  });
});
