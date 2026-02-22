import { html, nothing } from "lit";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  EnterpriseMetricsSnapshot,
  SkillStatusReport,
} from "../types.ts";
import type {
  SwarmFormState,
  SwarmTeamDefinition,
  SwarmWorkerForm,
} from "../controllers/swarm.ts";
import type { ProviderModelsGroup } from "../controllers/providers.ts";
import {
  renderAgentFiles,
  renderAgentChannels,
  renderAgentCron,
} from "./agents-panels-status-files.ts";
import { renderAgentTools, renderAgentSkills } from "./agents-panels-tools-skills.ts";
import { renderAgentMemory } from "./agents-panels-memory.ts";
import { renderAgentMetrics } from "./agents-panels-metrics.ts";
import { renderAgentSwarm } from "./agents-panels-swarm.ts";
import {
  agentBadgeText,
  buildAgentContext,
  resolveModelOptions,
  normalizeAgentLabel,
  normalizeModelValue,
  parseFallbackList,
  resolveAgentConfig,
  resolveAgentEmoji,
  resolveModelFallbacks,
  resolveModelLabel,
  resolveModelPrimary,
} from "./agents-utils.ts";

export type AgentsPanel = "overview" | "files" | "memory" | "metrics" | "tools" | "skills" | "channels" | "cron" | "swarm";

export type AgentsProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
  metricsLoading: boolean;
  metricsError: string | null;
  metricsSnapshot: EnterpriseMetricsSnapshot | null;
  swarmLoading: boolean;
  swarmSaving: boolean;
  swarmError: string | null;
  swarmTeams: SwarmTeamDefinition[];
  swarmSelectedTeamId: string | null;
  swarmForm: SwarmFormState;
  providersModels: ProviderModelsGroup[];
  runtimeDriversLoaded?: string[];
  runtimeDriversEnabled?: string[];
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
  onMetricsRefresh: () => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
  onSwarmRefresh: () => void;
  onSwarmCreate: () => void;
  onSwarmSelectTeam: (teamId: string) => void;
  onSwarmFormChange: <K extends keyof SwarmFormState>(key: K, value: SwarmFormState[K]) => void;
  onSwarmWorkerAdd: () => void;
  onSwarmWorkerRemove: (index: number) => void;
  onSwarmWorkerChange: <K extends keyof SwarmWorkerForm>(
    index: number,
    key: K,
    value: SwarmWorkerForm[K],
  ) => void;
  onSwarmSave: () => void;
  onSwarmDelete: (teamId: string) => void;
};

export type AgentContext = {
  workspace: string;
  model: string;
  identityName: string;
  identityEmoji: string;
  skillsLabel: string;
  isDefault: boolean;
};

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  return html`
    <div class="agents-layout">
      <section class="card agents-sidebar">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Agents</div>
            <div class="card-sub">${agents.length} configured.</div>
          </div>
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
            : nothing
        }
        <div class="agent-list" style="margin-top: 12px;">
          ${
            agents.length === 0
              ? html`
                  <div class="muted">No agents found.</div>
                `
              : agents.map((agent) => {
                  const badge = agentBadgeText(agent.id, defaultId);
                  const emoji = resolveAgentEmoji(agent, props.agentIdentityById[agent.id] ?? null);
                  return html`
                    <button
                      type="button"
                      class="agent-row ${selectedId === agent.id ? "active" : ""}"
                      @click=${() => props.onSelectAgent(agent.id)}
                    >
                      <div class="agent-avatar">${emoji || normalizeAgentLabel(agent).slice(0, 1)}</div>
                      <div class="agent-info">
                        <div class="agent-title">${normalizeAgentLabel(agent)}</div>
                        <div class="agent-sub mono">${agent.id}</div>
                      </div>
                      ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
                    </button>
                  `;
                })
          }
        </div>
      </section>
      <section class="agents-main">
        ${
          !selectedAgent
            ? html`
                <div class="card">
                  <div class="card-title">Select an agent</div>
                  <div class="card-sub">Pick an agent to inspect its workspace and tools.</div>
                </div>
              `
            : html`
                ${renderAgentHeader(
                  selectedAgent,
                  defaultId,
                  props.agentIdentityById[selectedAgent.id] ?? null,
                )}
                ${renderAgentTabs(props.activePanel, (panel) => props.onSelectPanel(panel))}
                ${
                  props.activePanel === "overview"
                    ? renderAgentOverview({
                        agent: selectedAgent,
                        defaultId,
                        configForm: props.configForm,
                        agentFilesList: props.agentFilesList,
                        agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                        agentIdentityError: props.agentIdentityError,
                        agentIdentityLoading: props.agentIdentityLoading,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        providersModels: props.providersModels,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                        onModelChange: props.onModelChange,
                        onModelFallbacksChange: props.onModelFallbacksChange,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "files"
                    ? renderAgentFiles({
                        agentId: selectedAgent.id,
                        agentFilesList: props.agentFilesList,
                        agentFilesLoading: props.agentFilesLoading,
                        agentFilesError: props.agentFilesError,
                        agentFileActive: props.agentFileActive,
                        agentFileContents: props.agentFileContents,
                        agentFileDrafts: props.agentFileDrafts,
                        agentFileSaving: props.agentFileSaving,
                        onLoadFiles: props.onLoadFiles,
                        onSelectFile: props.onSelectFile,
                        onFileDraftChange: props.onFileDraftChange,
                        onFileReset: props.onFileReset,
                        onFileSave: props.onFileSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "memory"
                    ? renderAgentMemory({
                        agentId: selectedAgent.id,
                        loading: props.agentFilesLoading,
                        error: props.agentFilesError,
                        filesList: props.agentFilesList,
                        activeFile: props.agentFileActive,
                        fileContents: props.agentFileContents,
                        onLoadFiles: () => props.onLoadFiles(selectedAgent.id),
                        onOpenFile: (name) => props.onSelectFile(name),
                      })
                    : nothing
                }
                ${
                  props.activePanel === "metrics"
                    ? renderAgentMetrics({
                        agentId: selectedAgent.id,
                        loading: props.metricsLoading,
                        error: props.metricsError,
                        snapshot: props.metricsSnapshot,
                        onRefresh: props.onMetricsRefresh,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "swarm"
                    ? renderAgentSwarm({
                        agentId: selectedAgent.id,
                        loading: props.swarmLoading,
                        saving: props.swarmSaving,
                        error: props.swarmError,
                        teams: props.swarmTeams,
                        selectedTeamId: props.swarmSelectedTeamId,
                        form: props.swarmForm,
                        availableAgentIds: agents.map((entry) => entry.id),
                        runtimeDriversLoaded: props.runtimeDriversLoaded,
                        runtimeDriversEnabled: props.runtimeDriversEnabled,
                        providersModels: props.providersModels,
                        onRefresh: props.onSwarmRefresh,
                        onCreate: props.onSwarmCreate,
                        onSelectTeam: props.onSwarmSelectTeam,
                        onFormChange: props.onSwarmFormChange,
                        onWorkerAdd: props.onSwarmWorkerAdd,
                        onWorkerRemove: props.onSwarmWorkerRemove,
                        onWorkerChange: props.onSwarmWorkerChange,
                        onSave: props.onSwarmSave,
                        onDelete: props.onSwarmDelete,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "tools"
                    ? renderAgentTools({
                        agentId: selectedAgent.id,
                        configForm: props.configForm,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        onProfileChange: props.onToolsProfileChange,
                        onOverridesChange: props.onToolsOverridesChange,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "skills"
                    ? renderAgentSkills({
                        agentId: selectedAgent.id,
                        report: props.agentSkillsReport,
                        loading: props.agentSkillsLoading,
                        error: props.agentSkillsError,
                        activeAgentId: props.agentSkillsAgentId,
                        configForm: props.configForm,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        filter: props.skillsFilter,
                        onFilterChange: props.onSkillsFilterChange,
                        onRefresh: props.onSkillsRefresh,
                        onToggle: props.onAgentSkillToggle,
                        onClear: props.onAgentSkillsClear,
                        onDisableAll: props.onAgentSkillsDisableAll,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "channels"
                    ? renderAgentChannels({
                        context: buildAgentContext(
                          selectedAgent,
                          props.configForm,
                          props.agentFilesList,
                          defaultId,
                          props.agentIdentityById[selectedAgent.id] ?? null,
                        ),
                        configForm: props.configForm,
                        snapshot: props.channelsSnapshot,
                        loading: props.channelsLoading,
                        error: props.channelsError,
                        lastSuccess: props.channelsLastSuccess,
                        onRefresh: props.onChannelsRefresh,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "cron"
                    ? renderAgentCron({
                        context: buildAgentContext(
                          selectedAgent,
                          props.configForm,
                          props.agentFilesList,
                          defaultId,
                          props.agentIdentityById[selectedAgent.id] ?? null,
                        ),
                        agentId: selectedAgent.id,
                        jobs: props.cronJobs,
                        status: props.cronStatus,
                        loading: props.cronLoading,
                        error: props.cronError,
                        onRefresh: props.onCronRefresh,
                      })
                    : nothing
                }
              `
        }
      </section>
    </div>
  `;
}

function renderAgentHeader(
  agent: AgentsListResult["agents"][number],
  defaultId: string | null,
  agentIdentity: AgentIdentityResult | null,
) {
  const badge = agentBadgeText(agent.id, defaultId);
  const displayName = normalizeAgentLabel(agent);
  const subtitle = agent.identity?.theme?.trim() || "Agent workspace and routing.";
  const emoji = resolveAgentEmoji(agent, agentIdentity);
  return html`
    <section class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">${emoji || displayName.slice(0, 1)}</div>
        <div>
          <div class="card-title">${displayName}</div>
          <div class="card-sub">${subtitle}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <div class="mono">${agent.id}</div>
        ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
      </div>
    </section>
  `;
}

function renderAgentTabs(active: AgentsPanel, onSelect: (panel: AgentsPanel) => void) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "memory", label: "Memory (LTM)" },
    { id: "metrics", label: "Metrics" },
    { id: "swarm", label: "Swarm" },
    { id: "tools", label: "Tools" },
    { id: "skills", label: "Skills" },
    { id: "channels", label: "Channels" },
    { id: "cron", label: "Jobs" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

type ParsedModelRoute = {
  driverId: string | null;
  providerId: string | null;
  modelId: string | null;
  raw: string;
};

function parseAgentModelRoute(rawValue: string | null | undefined): ParsedModelRoute {
  const raw = (rawValue ?? "").trim();
  if (!raw) {
    return { driverId: null, providerId: null, modelId: null, raw: "" };
  }
  const routeMatch = raw.match(/^([^:]+)::([^/]+)\/(.+)$/);
  if (routeMatch) {
    return {
      driverId: routeMatch[1]?.trim() || null,
      providerId: routeMatch[2]?.trim() || null,
      modelId: routeMatch[3]?.trim() || null,
      raw,
    };
  }
  const legacyMatch = raw.match(/^([^/]+)\/(.+)$/);
  if (legacyMatch) {
    return {
      driverId: null,
      providerId: legacyMatch[1]?.trim() || null,
      modelId: legacyMatch[2]?.trim() || null,
      raw,
    };
  }
  return { driverId: null, providerId: null, modelId: raw, raw };
}

function buildAgentModelRouteIndex(providersModels: ProviderModelsGroup[]) {
  const rows: Array<{
    driverId: string;
    providerId: string;
    modelId: string;
    value: string;
    name: string;
    toolMode: boolean;
    toolContract?: Record<string, unknown>;
  }> = [];
  for (const group of providersModels) {
    const providerId = group.providerId?.trim();
    if (!providerId) continue;
    for (const model of group.models ?? []) {
      const modelId = model.id?.trim();
      if (!modelId) continue;
      const driverId = model.driverId?.trim() || "default";
      const value = model.modelRoute?.trim() || `${providerId}/${modelId}`;
      rows.push({
        driverId,
        providerId,
        modelId,
        value,
        name: model.name?.trim() || modelId,
        toolMode: Boolean(model.toolMode),
        toolContract:
          model.toolContract && typeof model.toolContract === "object"
            ? (model.toolContract as Record<string, unknown>)
            : undefined,
      });
    }
  }
  return rows;
}

function renderAgentOverview(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  providersModels: ProviderModelsGroup[];
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
}) {
  const {
    agent,
    configForm,
    agentFilesList,
    agentIdentity,
    agentIdentityLoading,
    agentIdentityError,
    configLoading,
    configSaving,
    configDirty,
    providersModels,
    onConfigReload,
    onConfigSave,
    onModelChange,
    onModelFallbacksChange,
  } = params;
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const model = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary =
    resolveModelPrimary(config.entry?.model) || (model !== "-" ? normalizeModelValue(model) : null);
  const defaultPrimary =
    resolveModelPrimary(config.defaults?.model) ||
    (defaultModel !== "-" ? normalizeModelValue(defaultModel) : null);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";
  const modelOptions = resolveModelOptions(configForm, providersModels, effectivePrimary ?? undefined);
  const routeRows = buildAgentModelRouteIndex(providersModels);
  const parsedCurrent = parseAgentModelRoute(effectivePrimary);
  const driverOptions = Array.from(new Set(routeRows.map((row) => row.driverId))).sort((a, b) =>
    a.localeCompare(b),
  );
  const selectedDriverFromCurrent =
    parsedCurrent.driverId && routeRows.some((row) => row.driverId === parsedCurrent.driverId)
      ? parsedCurrent.driverId
      : driverOptions[0] ?? null;
  const providerOptions = Array.from(
    new Set(
      routeRows
        .filter((row) => !selectedDriverFromCurrent || row.driverId === selectedDriverFromCurrent)
        .map((row) => row.providerId),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const selectedProviderFromCurrent =
    parsedCurrent.providerId && providerOptions.includes(parsedCurrent.providerId)
      ? parsedCurrent.providerId
      : providerOptions[0] ?? null;
  const modelRows = routeRows.filter(
    (row) =>
      (!selectedDriverFromCurrent || row.driverId === selectedDriverFromCurrent) &&
      (!selectedProviderFromCurrent || row.providerId === selectedProviderFromCurrent),
  );
  const selectedModelRow =
    routeRows.find((row) => row.value === effectivePrimary) ??
    routeRows.find(
      (row) =>
        row.driverId === selectedDriverFromCurrent &&
        row.providerId === selectedProviderFromCurrent &&
        row.modelId === parsedCurrent.modelId,
    ) ??
    null;
  const modelSuggestionsId = `agent-model-suggestions-${agent.id}`;
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    "-";
  const resolvedEmoji = resolveAgentEmoji(agent, agentIdentity);
  const identityEmoji = resolvedEmoji || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const identityStatus = agentIdentityLoading
    ? "Loading…"
    : agentIdentityError
      ? "Unavailable"
      : "";
  const isDefault = Boolean(params.defaultId && agent.id === params.defaultId);

  return html`
    <section class="card">
      <div class="card-title">Overview</div>
      <div class="card-sub">Workspace paths and identity metadata.</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">Workspace</div>
          <div class="mono">${workspace}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Primary Model</div>
          <div class="mono">${model}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Access Token</div>
          <div class="mono" style="word-break: break-all;">${(configForm as any)?.gateway?.auth?.token || "**********"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Identity Name</div>
          <div>${identityName}</div>
          ${identityStatus ? html`<div class="agent-kv-sub muted">${identityStatus}</div>` : nothing}
        </div>
        <div class="agent-kv">
          <div class="label">Default</div>
          <div>${isDefault ? "yes" : "no"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Identity Emoji</div>
          <div>${identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Skills Filter</div>
          <div>${skillFilter ? `${skillCount} selected` : "all skills"}</div>
        </div>
      </div>

      <div class="agent-model-select" style="margin-top: 20px;">
        <div class="label">Model Selection</div>
        <div class="row" style="gap: 12px; flex-wrap: wrap; margin-bottom: 10px;">
          <label class="field" style="min-width: 180px; flex: 1;">
            <span>Driver</span>
            <select
              .value=${selectedDriverFromCurrent ?? ""}
              ?disabled=${!configForm || configLoading || configSaving || driverOptions.length === 0}
              @change=${(e: Event) => {
                const nextDriver = (e.target as HTMLSelectElement).value.trim();
                const nextProvider = routeRows.find((row) => row.driverId === nextDriver)?.providerId ?? "";
                const nextModel = routeRows.find(
                  (row) => row.driverId === nextDriver && row.providerId === nextProvider,
                );
                onModelChange(agent.id, nextModel?.value ?? null);
              }}
            >
              ${driverOptions.length === 0
                ? html`<option value="">No drivers in catalog</option>`
                : driverOptions.map((driverId) => html`<option value=${driverId}>${driverId}</option>`)}
            </select>
          </label>
          <label class="field" style="min-width: 220px; flex: 1;">
            <span>Provider</span>
            <select
              .value=${selectedProviderFromCurrent ?? ""}
              ?disabled=${!configForm || configLoading || configSaving || providerOptions.length === 0}
              @change=${(e: Event) => {
                const nextProvider = (e.target as HTMLSelectElement).value.trim();
                const nextModel = routeRows.find(
                  (row) =>
                    row.driverId === selectedDriverFromCurrent &&
                    row.providerId === nextProvider,
                );
                onModelChange(agent.id, nextModel?.value ?? null);
              }}
            >
              ${providerOptions.length === 0
                ? html`<option value="">No providers</option>`
                : providerOptions.map((providerId) => html`<option value=${providerId}>${providerId}</option>`)}
            </select>
          </label>
          <label class="field" style="min-width: 320px; flex: 2;">
            <span>Model route</span>
            <select
              .value=${selectedModelRow?.value ?? effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving || modelRows.length === 0}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement).value.trim();
                onModelChange(agent.id, value || null);
              }}
            >
              ${modelRows.length === 0
                ? html`<option value="">No models for selection</option>`
                : modelRows.map(
                    (row) =>
                      html`<option value=${row.value}>
                        ${row.name} (${row.modelId})${row.toolMode ? " [tool]" : ""}
                      </option>`,
                  )}
            </select>
          </label>
        </div>
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Primary model${isDefault ? " (default)" : ""} (searchable)</span>
            <input
              type="text"
              list=${modelSuggestionsId}
              .value=${effectivePrimary ?? ""}
              ?disabled=${!configForm || configLoading || configSaving}
              placeholder=${defaultPrimary && !isDefault
                ? `Inherit default (${defaultPrimary})`
                : "provider/model"}
              @change=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value.trim();
                onModelChange(agent.id, value || null);
              }}
            />
            <datalist id=${modelSuggestionsId}>
              ${modelOptions.map((option) => html`<option value=${option.value}>${option.label}</option>`)}
            </datalist>
            ${
              !isDefault
                ? html`
                    <div class="row" style="justify-content: flex-start; margin-top: 6px;">
                      <button
                        class="btn btn--sm"
                        type="button"
                        ?disabled=${!configForm || configLoading || configSaving}
                        @click=${() => onModelChange(agent.id, null)}
                      >
                        Inherit default
                      </button>
                    </div>
                  `
                : nothing
            }
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Fallbacks (comma-separated)</span>
            <input
              .value=${fallbackText}
              ?disabled=${!configForm || configLoading || configSaving}
              placeholder="provider/model, provider/model"
              @input=${(e: Event) =>
                onModelFallbacksChange(
                  agent.id,
                  parseFallbackList((e.target as HTMLInputElement).value),
                )}
            />
          </label>
        </div>
        ${
          selectedModelRow
            ? html`
                <div class="callout" style="margin-top: 10px;">
                  <div class="row" style="gap: 8px; flex-wrap: wrap;">
                    <span class="chip">driver: ${selectedModelRow.driverId}</span>
                    <span class="chip">provider: ${selectedModelRow.providerId}</span>
                    <span class="chip">model: ${selectedModelRow.modelId}</span>
                    <span class="chip">${selectedModelRow.toolMode ? "tool mode" : "agent mode"}</span>
                  </div>
                  <div style="margin-top: 8px;">
                    Tool Mode é metadata da rota de modelo (API/ferramenta), não papel de agente/container.
                  </div>
                  ${
                    selectedModelRow.toolContract
                      ? html`
                          <details style="margin-top: 8px;">
                            <summary class="mono">toolContract (preview)</summary>
                            <pre class="mono" style="white-space: pre-wrap; margin-top: 8px;">${JSON.stringify(selectedModelRow.toolContract, null, 2)}</pre>
                          </details>
                        `
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        <div class="row" style="justify-content: flex-end; gap: 8px;">
          <button class="btn btn--sm" ?disabled=${configLoading} @click=${onConfigReload}>
            Reload Config
          </button>
          <button
            class="btn btn--sm primary"
            ?disabled=${configSaving || !configDirty}
            @click=${onConfigSave}
          >
            ${configSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </section>
  `;
}
