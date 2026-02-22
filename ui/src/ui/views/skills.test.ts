import { render } from "lit";
import { describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import type { SkillStatusReport } from "../types.ts";
import { renderSkills } from "./skills.ts";

describe("skills view", () => {
  it("renders external endpoint/policy/test controls", async () => {
    await i18n.setLocale("en");
    const report: SkillStatusReport = {
      workspaceDir: "/tmp/workspace",
      managedSkillsDir: "/tmp/workspace/skills",
      adapter: {
        mode: "remote",
        transport: "http-tool-bus",
        endpointConfigured: true,
        manifestsLoaded: 2,
      },
      skills: [
        {
          name: "reporting",
          description: "Builds report payloads",
          source: "workspace",
          filePath: "/tmp/workspace/skills/reporting/SKILL.md",
          baseDir: "/tmp/workspace/skills/reporting",
          skillKey: "reporting",
          always: false,
          disabled: false,
          blockedByAllowlist: false,
          eligible: true,
          requirements: { bins: [], env: [], config: [], os: [] },
          missing: { bins: [], env: [], config: [], os: [] },
          configChecks: [],
          install: [],
        },
      ],
    };
    const container = document.createElement("div");
    render(
      renderSkills({
        loading: false,
        report,
        error: null,
        filter: "",
        edits: {},
        testResults: {},
        busyKey: null,
        messages: {},
        onFilterChange: () => {},
        onRefresh: () => {},
        onToggle: () => {},
        onEdit: () => {},
        onSaveKey: () => {},
        onExternalEndpointEdit: () => {},
        onExternalPolicyEdit: () => {},
        onExternalTestPayloadEdit: () => {},
        onExternalSave: () => {},
        onExternalTest: () => {},
        externalEndpointValue: () => "",
        externalPolicyValue: () => "",
        externalTestPayloadValue: () => "",
        onInstall: () => {},
      }),
      container,
    );

    expect(container.textContent).toContain("External tool adapter");
    expect(container.textContent).toContain("Execution policy");
    expect(container.textContent).toContain("Save external config");
    expect(container.textContent).toContain("Test endpoint");
  });
});
