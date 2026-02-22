import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type {
  SwarmFormState,
  SwarmTeamDefinition,
  SwarmWorkerForm,
} from "../controllers/swarm.ts";

export type AgentSwarmProps = {
  agentId: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  teams: SwarmTeamDefinition[];
  selectedTeamId: string | null;
  form: SwarmFormState;
  availableAgentIds: string[];
  onRefresh: () => void;
  onCreate: () => void;
  onSelectTeam: (teamId: string) => void;
  onFormChange: <K extends keyof SwarmFormState>(key: K, value: SwarmFormState[K]) => void;
  onWorkerAdd: () => void;
  onWorkerRemove: (index: number) => void;
  onWorkerChange: <K extends keyof SwarmWorkerForm>(
    index: number,
    key: K,
    value: SwarmWorkerForm[K],
  ) => void;
  onSave: () => void;
  onDelete: (teamId: string) => void;
};

function renderWorkerRow(
  props: AgentSwarmProps,
  worker: SwarmWorkerForm,
  index: number,
) {
  return html`
    <div class="card" style="padding: 12px; margin-bottom: 10px;">
      <div class="row" style="gap: 10px; align-items: end; flex-wrap: wrap;">
        <label class="field" style="min-width: 170px; flex: 1;">
          <span>${t("swarmPage.worker")}</span>
          <select
            .value=${worker.agentId}
            @change=${(event: Event) =>
              props.onWorkerChange(index, "agentId", (event.target as HTMLSelectElement).value)}
          >
            <option value="">${t("swarmPage.selectAgent")}</option>
            ${props.availableAgentIds.map(
              (agentId) => html`<option value=${agentId}>${agentId}</option>`,
            )}
          </select>
        </label>
        <label class="field" style="min-width: 170px; flex: 1;">
          <span>${t("swarmPage.displayName")}</span>
          <input
            .value=${worker.displayName}
            placeholder=${t("swarmPage.displayNamePlaceholder")}
            @input=${(event: Event) =>
              props.onWorkerChange(index, "displayName", (event.target as HTMLInputElement).value)}
          />
        </label>
        <button class="btn btn--sm danger" type="button" @click=${() => props.onWorkerRemove(index)}>
          ${t("swarmPage.remove")}
        </button>
      </div>
      <div class="row" style="gap: 10px; margin-top: 10px; flex-wrap: wrap;">
        <label class="field" style="min-width: 220px; flex: 1;">
          <span>${t("swarmPage.specialtiesCsv")}</span>
          <input
            .value=${worker.specialties}
            placeholder="relatorios, dashboards"
            @input=${(event: Event) =>
              props.onWorkerChange(index, "specialties", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 220px; flex: 1;">
          <span>${t("swarmPage.allowedScopesCsv")}</span>
          <input
            .value=${worker.allowedScopes}
            placeholder="jobs:schedule:self, skills:invoke"
            @input=${(event: Event) =>
              props.onWorkerChange(index, "allowedScopes", (event.target as HTMLInputElement).value)}
          />
        </label>
      </div>
    </div>
  `;
}

export function renderAgentSwarm(props: AgentSwarmProps) {
  const filteredTeams = props.teams.filter((team) => team.supervisorAgentId === props.agentId);
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div class="card-title">${t("swarmPage.title")}</div>
          <div class="card-sub">${t("swarmPage.supervisorTeams", { id: props.agentId })}</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" type="button" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("swarmPage.loading") : t("common.refresh")}
          </button>
          <button class="btn btn--sm" type="button" @click=${props.onCreate}>
            ${t("swarmPage.newTeam")}
          </button>
        </div>
      </div>

      <div class="callout" style="margin-bottom: 14px;">
        <strong>${t("swarmPage.enterpriseContext")}:</strong> ${t("swarmPage.enterpriseContextText")}
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-bottom: 14px;">${props.error}</div>` : nothing}

      <div class="row" style="gap: 14px; align-items: start; flex-wrap: wrap;">
        <div style="min-width: 260px; flex: 1;">
          <div class="card-sub" style="margin-bottom: 8px;">${t("swarmPage.registeredTeams")}</div>
          <div class="agent-list">
            ${
              filteredTeams.length === 0
                ? html`<div class="muted">${t("swarmPage.noTeams")}</div>`
                : filteredTeams.map(
                    (team) => html`
                      <button
                        type="button"
                        class="agent-row ${props.selectedTeamId === team.teamId ? "active" : ""}"
                        @click=${() => props.onSelectTeam(team.teamId)}
                      >
                        <div class="agent-info">
                          <div class="agent-title">${team.teamId}</div>
                          <div class="agent-sub mono">${t("swarmPage.workersCount", { count: String(team.workers.length) })}</div>
                        </div>
                        <span class="agent-pill">${t("swarmPage.teamBadge")}</span>
                      </button>
                    `,
                  )
            }
          </div>
        </div>

        <div style="min-width: 380px; flex: 2;">
          <div class="card-sub" style="margin-bottom: 8px;">
            ${props.selectedTeamId ? t("swarmPage.editTeam", { id: props.selectedTeamId }) : t("swarmPage.createTeam")}
          </div>

          <div class="row" style="gap: 10px; flex-wrap: wrap;">
            <label class="field" style="min-width: 160px; flex: 1;">
              <span>${t("swarmPage.teamId")}</span>
              <input
                .value=${props.form.teamId}
                placeholder="time-vendas"
                @input=${(event: Event) =>
                  props.onFormChange("teamId", (event.target as HTMLInputElement).value)}
              />
            </label>
            <label class="field" style="min-width: 200px; flex: 1;">
              <span>${t("swarmPage.supervisor")}</span>
              <select
                .value=${props.form.supervisorAgentId}
                @change=${(event: Event) =>
                  props.onFormChange("supervisorAgentId", (event.target as HTMLSelectElement).value)}
              >
                <option value="">${t("swarmPage.selectAgent")}</option>
                ${props.availableAgentIds.map(
                  (agentId) => html`<option value=${agentId}>${agentId}</option>`,
                )}
              </select>
            </label>
          </div>

          <div class="row" style="justify-content: space-between; margin: 12px 0 8px;">
            <div class="card-sub">${t("swarmPage.workers")}</div>
            <button class="btn btn--sm" type="button" @click=${props.onWorkerAdd}>
              ${t("swarmPage.addWorker")}
            </button>
          </div>
          ${
            props.form.workers.length === 0
              ? html`<div class="muted" style="margin-bottom: 12px;">${t("swarmPage.noWorkers")}</div>`
              : props.form.workers.map((worker, index) => renderWorkerRow(props, worker, index))
          }

          <div class="row" style="gap: 8px; justify-content: flex-end; margin-top: 10px;">
            ${
              props.selectedTeamId
                ? html`
                    <button
                      class="btn btn--sm danger"
                      type="button"
                      ?disabled=${props.saving}
                      @click=${() => props.onDelete(props.selectedTeamId ?? "")}
                    >
                      ${t("swarmPage.delete")}
                    </button>
                  `
                : nothing
            }
            <button class="btn btn--sm primary" type="button" ?disabled=${props.saving} @click=${props.onSave}>
              ${props.saving ? t("swarmPage.saving") : t("swarmPage.save")}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}
