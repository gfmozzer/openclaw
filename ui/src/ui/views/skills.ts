import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { SkillMessageMap } from "../controllers/skills.ts";
import { clampText } from "../format.ts";
import type { SkillStatusEntry, SkillStatusReport } from "../types.ts";
import { groupSkills } from "./skills-grouping.ts";
import {
  computeSkillMissing,
  computeSkillReasons,
  renderSkillStatusChips,
} from "./skills-shared.ts";

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  testResults: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onExternalEndpointEdit: (skillKey: string, value: string) => void;
  onExternalPolicyEdit: (skillKey: string, value: string) => void;
  onExternalTestPayloadEdit: (skillKey: string, value: string) => void;
  onExternalSave: (skillKey: string) => void;
  onExternalTest: (skillKey: string) => void;
  externalEndpointValue: (skillKey: string) => string;
  externalPolicyValue: (skillKey: string) => string;
  externalTestPayloadValue: (skillKey: string) => string;
  onInstall: (skillKey: string, name: string, installId: string) => void;
};

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter),
      )
    : skills;
  const groups = groupSkills(filtered);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("skillsPage.title")}</div>
          <div class="card-sub">${t("skillsPage.subtitle")}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("skillsPage.loading") : t("common.refresh")}
        </button>
      </div>

      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>${t("skillsPage.filter")}</span>
          <input
            .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder=${t("skillsPage.searchPlaceholder")}
          />
        </label>
        <div class="muted">${t("skillsPage.shown", { count: String(filtered.length) })}</div>
      </div>

      ${renderAdapterStatus(props.report)}

      ${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }

      ${
        filtered.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("skillsPage.noSkills")}</div>
            `
          : html`
            <div class="agent-skills-groups" style="margin-top: 16px;">
              ${groups.map((group) => {
                const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
                return html`
                  <details class="agent-skills-group" ?open=${!collapsedByDefault}>
                    <summary class="agent-skills-header">
                      <span>${group.label}</span>
                      <span class="muted">${group.skills.length}</span>
                    </summary>
                    <div class="list skills-grid">
                      ${group.skills.map((skill) => renderSkill(skill, props))}
                    </div>
                  </details>
                `;
              })}
            </div>
          `
      }
    </section>
  `;
}

function renderAdapterStatus(report: SkillStatusReport | null) {
  const adapter = report?.adapter;
  if (!adapter) {
    return nothing;
  }
  const endpointState = adapter.endpointConfigured
    ? t("skillsPage.configured")
    : t("skillsPage.missingState");
  const modeLabel = adapter.mode === "remote" ? "remote" : "local";
  return html`
    <div class="callout" style="margin-top: 12px;">
      <strong>${t("skillsPage.adapter")}:</strong>
      <span class="mono">${modeLabel}</span> via
      <span class="mono">${adapter.transport}</span>
      <br />
      <span class="muted">
        ${t("skillsPage.endpoint")}: ${endpointState} · ${t("skillsPage.manifests")}: ${adapter.manifestsLoaded}
      </span>
    </div>
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const externalEndpoint = props.externalEndpointValue(skill.skillKey);
  const externalPolicy = props.externalPolicyValue(skill.skillKey);
  const externalTestPayload = props.externalTestPayloadValue(skill.skillKey);
  const externalTestResult = props.testResults[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">
          ${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}
        </div>
        <div class="list-sub">${clampText(skill.description, 140)}</div>
        ${renderSkillStatusChips({ skill, showBundledBadge })}
        ${
          missing.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skillsPage.missing")}: ${missing.join(", ")}
              </div>
            `
            : nothing
        }
        ${
          reasons.length > 0
            ? html`
              <div class="muted" style="margin-top: 6px;">
                ${t("skillsPage.reason")}: ${reasons.join(", ")}
              </div>
            `
            : nothing
        }
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; flex-wrap: wrap;">
          <button
            class="btn"
            ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}
          >
            ${skill.disabled ? t("skillsPage.enable") : t("skillsPage.disable")}
          </button>
          ${
            canInstall
              ? html`<button
                class="btn"
                ?disabled=${busy}
                @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}
              >
                ${busy ? t("skillsPage.installing") : skill.install[0].label}
              </button>`
              : nothing
          }
        </div>
        ${
          message
            ? html`<div
              class="muted"
              style="margin-top: 8px; color: ${
                message.kind === "error"
                  ? "var(--danger-color, #d14343)"
                  : "var(--success-color, #0a7f5a)"
              };"
            >
              ${message.message}
            </div>`
            : nothing
        }
        ${
          skill.primaryEnv
            ? html`
              <div class="field" style="margin-top: 10px;">
                <span>${t("skillsPage.apiKey")}</span>
                <input
                  type="password"
                  .value=${apiKey}
                  @input=${(e: Event) =>
                    props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
                />
              </div>
              <button
                class="btn primary"
                style="margin-top: 8px;"
                ?disabled=${busy}
                @click=${() => props.onSaveKey(skill.skillKey)}
              >
                ${t("skillsPage.saveKey")}
              </button>
            `
            : nothing
        }
        <div class="callout" style="margin-top: 10px;">
          <strong>${t("skillsPage.externalSectionTitle")}</strong>
          <div class="muted">${t("skillsPage.externalSectionSub")}</div>
          <div class="field" style="margin-top: 8px;">
            <span>${t("skillsPage.externalEndpoint")}</span>
            <input
              .value=${externalEndpoint}
              @input=${(e: Event) =>
                props.onExternalEndpointEdit(skill.skillKey, (e.target as HTMLInputElement).value)}
              placeholder="https://api.example.com/skills/report"
            />
          </div>
          <div class="field" style="margin-top: 8px;">
            <span>${t("skillsPage.externalPolicy")}</span>
            <select
              .value=${externalPolicy}
              @change=${(e: Event) =>
                props.onExternalPolicyEdit(skill.skillKey, (e.target as HTMLSelectElement).value)}
            >
              <option value="">fallbackInternal</option>
              <option value="preferExternal">preferExternal</option>
              <option value="fallbackInternal">fallbackInternal</option>
              <option value="denyInternal">denyInternal</option>
            </select>
          </div>
          <button
            class="btn"
            style="margin-top: 8px;"
            ?disabled=${busy}
            @click=${() => props.onExternalSave(skill.skillKey)}
          >
            ${t("skillsPage.externalSave")}
          </button>
          <div class="field" style="margin-top: 10px;">
            <span>${t("skillsPage.externalTestPayload")}</span>
            <textarea
              rows="3"
              .value=${externalTestPayload}
              @input=${(e: Event) =>
                props.onExternalTestPayloadEdit(
                  skill.skillKey,
                  (e.target as HTMLTextAreaElement).value,
                )}
              placeholder='{"jobId":"demo-1"}'
            ></textarea>
          </div>
          <button
            class="btn primary"
            style="margin-top: 8px;"
            ?disabled=${busy}
            @click=${() => props.onExternalTest(skill.skillKey)}
          >
            ${t("skillsPage.externalTest")}
          </button>
          ${
            externalTestResult
              ? html`<pre class="mono" style="margin-top: 8px; max-height: 180px; overflow: auto;">${externalTestResult}</pre>`
              : nothing
          }
        </div>
      </div>
    </div>
  `;
}
