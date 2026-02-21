import { html, nothing } from "lit";
import type {
  EnterpriseIdentityInput,
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
  identity: EnterpriseIdentityInput;
  availableAgentIds: string[];
  onRefresh: () => void;
  onCreate: () => void;
  onSelectTeam: (teamId: string) => void;
  onIdentityChange: <K extends keyof EnterpriseIdentityInput>(
    key: K,
    value: EnterpriseIdentityInput[K],
  ) => void;
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
          <span>Worker</span>
          <select
            .value=${worker.agentId}
            @change=${(event: Event) =>
              props.onWorkerChange(index, "agentId", (event.target as HTMLSelectElement).value)}
          >
            <option value="">Selecionar agente</option>
            ${props.availableAgentIds.map(
              (agentId) => html`<option value=${agentId}>${agentId}</option>`,
            )}
          </select>
        </label>
        <label class="field" style="min-width: 170px; flex: 1;">
          <span>Nome exibido</span>
          <input
            .value=${worker.displayName}
            placeholder="Ex: Especialista em Relatórios"
            @input=${(event: Event) =>
              props.onWorkerChange(index, "displayName", (event.target as HTMLInputElement).value)}
          />
        </label>
        <button class="btn btn--sm danger" type="button" @click=${() => props.onWorkerRemove(index)}>
          Remover
        </button>
      </div>
      <div class="row" style="gap: 10px; margin-top: 10px; flex-wrap: wrap;">
        <label class="field" style="min-width: 220px; flex: 1;">
          <span>Especialidades (CSV)</span>
          <input
            .value=${worker.specialties}
            placeholder="relatorios, dashboards"
            @input=${(event: Event) =>
              props.onWorkerChange(index, "specialties", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 220px; flex: 1;">
          <span>Scopes permitidos (CSV)</span>
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
          <div class="card-title">Swarm Orchestration</div>
          <div class="card-sub">Times do supervisor atual: ${props.agentId}</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" type="button" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Carregando..." : "Atualizar"}
          </button>
          <button class="btn btn--sm" type="button" @click=${props.onCreate}>
            Novo time
          </button>
        </div>
      </div>

      <div class="callout" style="margin-bottom: 14px;">
        <strong>Contexto enterprise:</strong> as operações de swarm exigem identidade e scopes.
      </div>

      <div class="row" style="gap: 10px; flex-wrap: wrap; margin-bottom: 14px;">
        <label class="field" style="min-width: 180px; flex: 1;">
          <span>Tenant ID</span>
          <input
            .value=${props.identity.tenantId}
            @input=${(event: Event) =>
              props.onIdentityChange("tenantId", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 180px; flex: 1;">
          <span>Requester ID</span>
          <input
            .value=${props.identity.requesterId}
            @input=${(event: Event) =>
              props.onIdentityChange("requesterId", (event.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field" style="min-width: 150px;">
          <span>Role</span>
          <select
            .value=${props.identity.role}
            @change=${(event: Event) =>
              props.onIdentityChange("role", (event.target as HTMLSelectElement).value as EnterpriseIdentityInput["role"])}
          >
            <option value="admin">admin</option>
            <option value="supervisor">supervisor</option>
            <option value="worker">worker</option>
          </select>
        </label>
        <label class="field" style="min-width: 260px; flex: 2;">
          <span>Scopes (CSV)</span>
          <input
            .value=${props.identity.scopes}
            @input=${(event: Event) =>
              props.onIdentityChange("scopes", (event.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-bottom: 14px;">${props.error}</div>` : nothing}

      <div class="row" style="gap: 14px; align-items: start; flex-wrap: wrap;">
        <div style="min-width: 260px; flex: 1;">
          <div class="card-sub" style="margin-bottom: 8px;">Times cadastrados</div>
          <div class="agent-list">
            ${
              filteredTeams.length === 0
                ? html`<div class="muted">Nenhum time cadastrado para este supervisor.</div>`
                : filteredTeams.map(
                    (team) => html`
                      <button
                        type="button"
                        class="agent-row ${props.selectedTeamId === team.teamId ? "active" : ""}"
                        @click=${() => props.onSelectTeam(team.teamId)}
                      >
                        <div class="agent-info">
                          <div class="agent-title">${team.teamId}</div>
                          <div class="agent-sub mono">${team.workers.length} workers</div>
                        </div>
                        <span class="agent-pill">team</span>
                      </button>
                    `,
                  )
            }
          </div>
        </div>

        <div style="min-width: 380px; flex: 2;">
          <div class="card-sub" style="margin-bottom: 8px;">
            ${props.selectedTeamId ? `Editar time ${props.selectedTeamId}` : "Criar novo time"}
          </div>

          <div class="row" style="gap: 10px; flex-wrap: wrap;">
            <label class="field" style="min-width: 160px; flex: 1;">
              <span>Team ID</span>
              <input
                .value=${props.form.teamId}
                placeholder="time-vendas"
                @input=${(event: Event) =>
                  props.onFormChange("teamId", (event.target as HTMLInputElement).value)}
              />
            </label>
            <label class="field" style="min-width: 200px; flex: 1;">
              <span>Supervisor</span>
              <select
                .value=${props.form.supervisorAgentId}
                @change=${(event: Event) =>
                  props.onFormChange("supervisorAgentId", (event.target as HTMLSelectElement).value)}
              >
                <option value="">Selecionar agente</option>
                ${props.availableAgentIds.map(
                  (agentId) => html`<option value=${agentId}>${agentId}</option>`,
                )}
              </select>
            </label>
          </div>

          <div class="row" style="justify-content: space-between; margin: 12px 0 8px;">
            <div class="card-sub">Workers</div>
            <button class="btn btn--sm" type="button" @click=${props.onWorkerAdd}>
              Adicionar worker
            </button>
          </div>
          ${
            props.form.workers.length === 0
              ? html`<div class="muted" style="margin-bottom: 12px;">Sem workers configurados.</div>`
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
                      Excluir
                    </button>
                  `
                : nothing
            }
            <button class="btn btn--sm primary" type="button" ?disabled=${props.saving} @click=${props.onSave}>
              ${props.saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}
