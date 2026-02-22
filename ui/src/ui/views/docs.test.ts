import { render } from "lit";
import { describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { renderDocsView } from "./docs.ts";

describe("docs view", () => {
  it("renders endpoint catalog sections", async () => {
    await i18n.setLocale("en");
    const container = document.createElement("div");
    render(renderDocsView({ basePath: "/ui" }), container);

    expect(container.textContent).toContain("In-App Docs");
    expect(container.textContent).toContain("chat.portal.stack.status");
    expect(container.textContent).toContain("cron.add");
    expect(container.textContent).toContain("swarm.team.upsert");
    expect(container.textContent).toContain("skills.status");
    expect(container.textContent).toContain("WebSocket");
  });
});
