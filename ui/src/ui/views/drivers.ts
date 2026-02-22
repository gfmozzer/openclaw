import { html, nothing } from "lit";
import type { PortalStackStatus } from "../types.ts";
import type {
  DriverModelsGroup,
  DriverProvidersGroup,
  DriverRegistryEntry,
} from "../controllers/drivers.ts";
import type { ProviderCredentialType } from "../controllers/providers.ts";

type DriversViewProps = {
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  notice: string | null;
  stack: PortalStackStatus | null;
  registry: DriverRegistryEntry[];
  matrix: DriverProvidersGroup[];
  modelsTree: DriverModelsGroup[];
  selectedDriverId: string | null;
  selectedProviderByDriver: Record<string, string>;
  drafts: Record<string, string>;
  types: Record<string, ProviderCredentialType>;
  profiles: Record<string, string>;
  credentialSmokeResults: Record<string, { ok: boolean; message: string }>;
  routeSmokeResults: Record<string, { ok: boolean; message: string }>;
  onRefresh: () => void;
  onSyncModels: () => void;
  onSelectDriver: (driverId: string | null) => void;
  onSelectProvider: (driverId: string, providerId: string | null) => void;
  onDraftChange: (driverId: string, providerId: string, value: string) => void;
  onTypeChange: (driverId: string, providerId: string, value: ProviderCredentialType) => void;
  onSaveCredential: (driverId: string, providerId: string) => void;
  onDeleteCredential: (driverId: string, providerId: string) => void;
  onTestCredential: (driverId: string, providerId: string) => void;
  onTestRoute: (driverId: string, providerId: string, modelRoute: string) => void;
  onOpenProviders: () => void;
};

function statusChipClass(ok: boolean): string {
  return ok ? "chip" : "chip";
}

function sourceBadge(source: string | undefined): string {
  return source ?? "unknown";
}

export function renderDrivers(props: DriversViewProps) {
  const drivers = props.stack?.drivers;
  const details = Array.isArray(drivers?.details) ? drivers.details : [];
  const enabled = Array.isArray(drivers?.enabled) ? drivers.enabled : [];
  const loaded = Array.isArray(drivers?.loaded) ? drivers.loaded : [];
  const failed = Array.isArray(drivers?.failed) ? drivers.failed : [];
  const selectedDriverId = props.selectedDriverId ?? props.registry[0]?.driverId ?? props.matrix[0]?.driverId ?? null;
  const selectedRegistry = selectedDriverId
    ? props.registry.find((d) => d.driverId === selectedDriverId) ?? null
    : null;
  const selectedMatrix = selectedDriverId
    ? props.matrix.find((d) => d.driverId === selectedDriverId) ?? null
    : null;
  const selectedModelsTree = selectedDriverId
    ? props.modelsTree.find((d) => d.driverId === selectedDriverId) ?? null
    : null;
  const selectedProviderId =
    (selectedDriverId ? props.selectedProviderByDriver[selectedDriverId] : null) ??
    selectedMatrix?.providers[0]?.providerId ??
    null;
  const selectedProviderRow = selectedMatrix?.providers.find((p) => p.providerId === selectedProviderId) ?? null;
  const selectedProviderModels =
    selectedModelsTree?.providers.find((p) => p.providerId === selectedProviderId) ?? null;
  const driverProviderKey =
    selectedDriverId && selectedProviderId ? `${selectedDriverId}::${selectedProviderId}` : null;
  const currentDraft = driverProviderKey ? props.drafts[driverProviderKey] ?? "" : "";
  const currentType = driverProviderKey ? props.types[driverProviderKey] ?? "api_key" : "api_key";
  const currentProfileId = driverProviderKey ? props.profiles[driverProviderKey] ?? "" : "";
  const currentCredentialSmoke = driverProviderKey ? props.credentialSmokeResults[driverProviderKey] : undefined;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div>
          <div class="card-title">Drivers</div>
          <div class="card-sub">
            Runtime de drivers carregados nesta instância/container.
          </div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Atualizando..." : "Atualizar stack"}
          </button>
          <button class="btn" ?disabled=${props.loading} @click=${props.onSyncModels}>
            ${props.loading ? "Sincronizando..." : "Sync models"}
          </button>
          <button class="btn primary" @click=${props.onOpenProviders}>Abrir Providers (credenciais/smoke)</button>
        </div>
      </div>

      ${props.notice ? html`<div class="callout" style="margin-top: 12px;">${props.notice}</div>` : nothing}
      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${!drivers
        ? html`<div class="callout" style="margin-top: 12px;">
            O método <span class="mono">chat.portal.stack.status</span> ainda não retornou o bloco
            <span class="mono">drivers</span>. Atualize a página após reiniciar o gateway.
          </div>`
        : html`
            <div class="row" style="gap: 12px; margin-top: 14px; flex-wrap: wrap;">
              <div class="pill"><span>Default</span><span class="mono">${drivers.defaultDriver ?? "n/a"}</span></div>
              <div class="pill"><span>Enabled</span><span class="mono">${enabled.length}</span></div>
              <div class="pill"><span>Loaded</span><span class="mono">${loaded.length}</span></div>
              <div class="pill ${failed.length > 0 ? "danger" : ""}">
                <span>Failed</span><span class="mono">${failed.length}</span>
              </div>
            </div>

            <div class="callout" style="margin-top: 12px;">
              Fluxo guiado inicial habilitado nesta aba:
              <strong>Driver -> Provider -> Credencial -> Smoke</strong>.
              A aba <strong>Providers</strong> continua disponível para compatibilidade.
            </div>

            <div class="row" style="margin-top: 16px; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
              <div style="min-width: 280px; flex: 1;">
                <div class="label">Drivers</div>
                <div class="list" style="margin-top: 8px; max-height: 300px; overflow: auto;">
                  ${props.registry.length === 0
                    ? html`<div class="list-item muted">Nenhum driver retornado pelo backend.</div>`
                    : props.registry.map(
                        (driver) => html`
                          <button
                            class="list-item"
                            style="width:100%; text-align:left; ${driver.driverId === selectedDriverId
                              ? "outline: 1px solid var(--accent, #2ecc71);"
                              : ""}"
                            @click=${() => props.onSelectDriver(driver.driverId)}
                          >
                            <div class="list-main">
                              <div class="list-title">${driver.driverId}</div>
                              <div class="list-sub">
                                ${sourceBadge(driver.source)} · ${driver.enabled ? "enabled" : "disabled"} ·
                                ${driver.loaded ? "loaded" : "not loaded"}
                              </div>
                              <div class="chips">
                                <span class="chip">providers: ${driver.providerCount ?? 0}</span>
                                <span class="chip">models: ${driver.modelCount ?? 0}</span>
                              </div>
                            </div>
                          </button>
                        `,
                      )}
                </div>
              </div>

              <div style="min-width: 360px; flex: 2;">
                ${!selectedDriverId
                  ? html`<div class="muted">Selecione um driver.</div>`
                  : html`
                      <div class="label">Driver selecionado</div>
                      <div class="row" style="margin-top: 8px; gap: 8px; flex-wrap: wrap;">
                        <span class="pill"><span>Driver</span><span class="mono">${selectedDriverId}</span></span>
                        <span class="pill"><span>Loaded</span><span class="mono">${selectedRegistry?.loaded ? "yes" : "no"}</span></span>
                        <span class="pill"><span>Source</span><span class="mono">${selectedRegistry?.source ?? "n/a"}</span></span>
                      </div>
                      ${selectedRegistry?.reason
                        ? html`<div class="callout danger" style="margin-top: 10px;">${selectedRegistry.reason}</div>`
                        : nothing}

                      <div class="label" style="margin-top: 14px;">Providers deste driver</div>
                      <div class="list" style="margin-top: 8px; max-height: 180px; overflow: auto;">
                        ${(selectedMatrix?.providers ?? []).length === 0
                          ? html`<div class="list-item muted">Nenhum provider visível para este driver.</div>`
                          : (selectedMatrix?.providers ?? []).map(
                              (provider) => html`
                                <button
                                  class="list-item"
                                  style="width:100%; text-align:left; ${provider.providerId === selectedProviderId
                                    ? "outline: 1px solid var(--accent, #2ecc71);"
                                    : ""}"
                                  @click=${() => props.onSelectProvider(selectedDriverId, provider.providerId)}
                                >
                                  <div class="list-main">
                                    <div class="list-title">${provider.label || provider.providerId}</div>
                                    <div class="list-sub mono">${provider.providerId}</div>
                                    <div class="chips">
                                      <span class="chip">${provider.hasCredential ? "credential: ok" : "credential: missing"}</span>
                                      <span class="chip">models: ${provider.modelCount}</span>
                                      ${provider.credentialType ? html`<span class="chip">${provider.credentialType}</span>` : nothing}
                                    </div>
                                  </div>
                                </button>
                              `,
                            )}
                      </div>

                      ${!selectedProviderId
                        ? html`<div class="muted" style="margin-top: 12px;">Selecione um provider.</div>`
                        : html`
                            <div class="label" style="margin-top: 16px;">Credencial (${selectedDriverId} / ${selectedProviderId})</div>
                            <div class="row" style="margin-top: 8px; gap: 12px; flex-wrap: wrap;">
                              <label class="field" style="min-width: 180px;">
                                <span>Tipo</span>
                                <select
                                  .value=${currentType}
                                  @change=${(e: Event) =>
                                    props.onTypeChange(
                                      selectedDriverId,
                                      selectedProviderId,
                                      (e.target as HTMLSelectElement).value as ProviderCredentialType,
                                    )}
                                >
                                  <option value="api_key">api_key</option>
                                  <option value="token">token</option>
                                  <option value="oauth">oauth</option>
                                </select>
                              </label>
                              <label class="field" style="min-width: 360px; flex:1;">
                                <span>Credencial</span>
                                <input
                                  type="password"
                                  .value=${currentDraft}
                                  placeholder="Cole a credencial"
                                  @input=${(e: Event) =>
                                    props.onDraftChange(
                                      selectedDriverId,
                                      selectedProviderId,
                                      (e.target as HTMLInputElement).value,
                                    )}
                                />
                              </label>
                            </div>
                            <div class="row" style="gap:8px; margin-top:8px; flex-wrap: wrap;">
                              <button
                                class="btn primary"
                                ?disabled=${props.saving || props.testing}
                                @click=${() => props.onSaveCredential(selectedDriverId, selectedProviderId)}
                              >
                                ${props.saving ? "Salvando..." : "Salvar credencial"}
                              </button>
                              <button
                                class="btn"
                                ?disabled=${props.testing || props.saving}
                                @click=${() => props.onTestCredential(selectedDriverId, selectedProviderId)}
                              >
                                ${props.testing ? "Testando..." : "Smoke credencial"}
                              </button>
                              <button
                                class="btn danger"
                                ?disabled=${props.saving || props.testing}
                                @click=${() => props.onDeleteCredential(selectedDriverId, selectedProviderId)}
                              >
                                Remover credencial
                              </button>
                            </div>
                            ${currentProfileId
                              ? html`<div class="muted mono" style="margin-top: 8px;">profileId: ${currentProfileId}</div>`
                              : html`<div class="muted" style="margin-top: 8px;">Sem profileId salvo ainda.</div>`}
                            ${currentCredentialSmoke
                              ? html`<div class="callout ${currentCredentialSmoke.ok ? "" : "danger"}" style="margin-top: 10px;">
                                  ${currentCredentialSmoke.ok ? "Smoke credencial OK:" : "Smoke credencial falhou:"}
                                  ${currentCredentialSmoke.message}
                                </div>`
                              : nothing}

                            <div class="label" style="margin-top: 16px;">Modelos/rotas deste driver+provider</div>
                            <div class="list" style="margin-top: 8px; max-height: 260px; overflow: auto;">
                              ${(selectedProviderModels?.models ?? []).length === 0
                                ? html`<div class="list-item muted">Sem modelos para este driver/provider.</div>`
                                : (selectedProviderModels?.models ?? []).map((model) => {
                                    const route = model.modelRoute ?? `${selectedDriverId}::${selectedProviderId}/${model.id}`;
                                    const routeSmoke = props.routeSmokeResults[route];
                                    return html`
                                      <div class="list-item" style="display:block;">
                                        <div class="row" style="justify-content: space-between; gap: 8px; align-items:flex-start; flex-wrap: wrap;">
                                          <div class="list-main">
                                            <div class="list-title">${model.name?.trim() || model.id}</div>
                                            <div class="list-sub mono">${route}</div>
                                            <div class="chips">
                                              ${model.source ? html`<span class="chip">${model.source}</span>` : nothing}
                                              ${model.toolMode ? html`<span class="chip">tool mode</span>` : nothing}
                                            </div>
                                          </div>
                                          <div class="row" style="gap:8px;">
                                            <button
                                              class="btn btn--sm"
                                              ?disabled=${props.testing}
                                              @click=${() => props.onTestRoute(selectedDriverId, selectedProviderId, route)}
                                            >
                                              ${props.testing ? "Testando..." : "Smoke rota"}
                                            </button>
                                          </div>
                                        </div>
                                        ${routeSmoke
                                          ? html`<div class="callout ${routeSmoke.ok ? "" : "danger"}" style="margin-top: 8px;">
                                              ${routeSmoke.ok ? "Smoke rota OK:" : "Smoke rota falhou:"}
                                              ${routeSmoke.message}
                                            </div>`
                                          : nothing}
                                      </div>
                                    `;
                                  })}
                            </div>
                            <div class="callout" style="margin-top: 10px;">
                              O smoke de rota nesta fase é <strong>transicional</strong> (disponibilidade da rota no catálogo + driver carregado + credencial), não inferência real.
                            </div>
                          `}
                    `}
              </div>
            </div>

            <div class="label" style="margin-top: 18px;">Diagnóstico de runtime (raw details)</div>
            <div class="list" style="margin-top: 8px; max-height: 420px; overflow: auto;">
              ${details.length === 0
                ? html`<div class="list-item muted">Nenhum driver detalhado retornado.</div>`
                : details.map(
                    (driver) => html`
                      <div class="list-item" style="display: block;">
                        <div
                          class="row"
                          style="justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;"
                        >
                          <div class="list-main">
                            <div class="list-title">${driver.driverId}</div>
                            <div class="list-sub">
                              ${driver.source} · ${driver.enabled ? "enabled" : "disabled"} ·
                              ${driver.loaded ? "loaded" : "not loaded"}
                            </div>
                          </div>
                          <div class="list-meta">
                            <span class=${statusChipClass(driver.enabled)}>enabled:${driver.enabled ? "yes" : "no"}</span>
                            <span class=${statusChipClass(driver.loaded)}>loaded:${driver.loaded ? "yes" : "no"}</span>
                          </div>
                        </div>
                        ${driver.package
                          ? html`<div class="muted mono" style="margin-top: 8px;">package: ${driver.package}</div>`
                          : nothing}
                        ${driver.entry
                          ? html`<div class="muted mono" style="margin-top: 4px;">entry: ${driver.entry}</div>`
                          : nothing}
                        ${driver.reason
                          ? html`<div class="callout danger" style="margin-top: 8px;">${driver.reason}</div>`
                          : nothing}
                      </div>
                    `,
                  )}
            </div>
          `}
    </section>
  `;
}
