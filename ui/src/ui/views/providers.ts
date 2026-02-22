import { html, nothing } from "lit";
import type { ProviderCredentialType, ProviderModelsGroup, ProviderRegistryEntry } from "../controllers/providers.ts";

export type ProvidersViewProps = {
  loading: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  notice: string | null;
  registry: ProviderRegistryEntry[];
  models: ProviderModelsGroup[];
  selectedId: string | null;
  drafts: Record<string, string>;
  types: Record<string, ProviderCredentialType>;
  profiles: Record<string, string>;
  testResults: Record<string, { ok: boolean; message: string }>;
  onRefresh: () => void;
  onSelect: (providerId: string | null) => void;
  onDraftChange: (providerId: string, value: string) => void;
  onTypeChange: (providerId: string, value: ProviderCredentialType) => void;
  onSaveCredential: (providerId: string) => void;
  onDeleteCredential: (providerId: string) => void;
  onTestCredential: (providerId: string) => void;
};

function sourceLabel(source: "plugin" | "builtin" | "custom"): string {
  if (source === "plugin") {
    return "plugin";
  }
  if (source === "custom") {
    return "custom";
  }
  return "builtin";
}

function resolveProviderModels(models: ProviderModelsGroup[], providerId: string): ProviderModelsGroup | null {
  return models.find((entry) => entry.providerId === providerId) ?? null;
}

export function renderProviders(props: ProvidersViewProps) {
  const selected = props.selectedId
    ? props.registry.find((entry) => entry.id === props.selectedId) ?? null
    : null;
  const selectedProviderId = selected?.id ?? props.registry[0]?.id ?? null;
  const selectedModels = selectedProviderId
    ? resolveProviderModels(props.models, selectedProviderId)
    : null;
  const currentType = selectedProviderId ? props.types[selectedProviderId] ?? "api_key" : "api_key";
  const currentDraft = selectedProviderId ? props.drafts[selectedProviderId] ?? "" : "";
  const currentProfileId = selectedProviderId ? props.profiles[selectedProviderId] ?? "" : "";
  const currentTest = selectedProviderId ? props.testResults[selectedProviderId] : undefined;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Providers</div>
          <div class="card-sub">
            Configure credenciais e escolha modelos sem editar JSON manualmente.
          </div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      ${props.notice ? html`<div class="callout" style="margin-top: 12px;">${props.notice}</div>` : nothing}
      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}
      <div class="callout" style="margin-top: 12px;">
        Tela legada/compatível. Para operação driver-aware (driver -> provider -> credencial -> smoke), use a aba
        <strong>Drivers</strong>.
      </div>

      <div class="row" style="margin-top: 16px; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
        <div style="min-width: 280px; flex: 1;">
          <div class="label">Providers suportados</div>
          <div class="list" style="margin-top: 8px; max-height: 420px; overflow: auto;">
            ${props.registry.length === 0
              ? html`<div class="list-item muted">Nenhum provider retornado pelo backend.</div>`
              : props.registry.map((entry) => {
                  const isSelected = entry.id === selectedProviderId;
                  return html`
                    <button
                      class="list-item"
                      style="width: 100%; text-align: left; ${isSelected
                        ? "outline: 1px solid var(--accent, #2ecc71);"
                        : ""}"
                      @click=${() => props.onSelect(entry.id)}
                    >
                      <div class="list-main">
                        <div class="list-title">${entry.label?.trim() || entry.id}</div>
                        <div class="list-sub mono">${entry.id}</div>
                        <div class="chips">
                          ${(entry.sources ?? []).map(
                            (source) =>
                              html`<span class="chip">${sourceLabel(source)}</span>`,
                          )}
                          <span class="chip">${entry.hasCredential ? "credential: ok" : "credential: missing"}</span>
                          ${typeof entry.modelCount === "number"
                            ? html`<span class="chip">models: ${entry.modelCount}</span>`
                            : nothing}
                        </div>
                      </div>
                    </button>
                  `;
                })}
          </div>
        </div>

        <div style="min-width: 320px; flex: 2;">
          ${
            !selectedProviderId
              ? html`<div class="muted">Selecione um provider.</div>`
              : html`
                  <div class="label">Credenciais</div>
                  <div class="row" style="margin-top: 8px; gap: 12px; flex-wrap: wrap;">
                    <label class="field" style="min-width: 180px;">
                      <span>Tipo</span>
                      <select
                        .value=${currentType}
                        @change=${(e: Event) =>
                          props.onTypeChange(
                            selectedProviderId,
                            (e.target as HTMLSelectElement).value as ProviderCredentialType,
                          )}
                      >
                        <option value="api_key">api_key</option>
                        <option value="token">token</option>
                        <option value="oauth">oauth</option>
                      </select>
                    </label>
                    <label class="field" style="min-width: 360px; flex: 1;">
                      <span>Credencial</span>
                      <input
                        type="password"
                        .value=${currentDraft}
                        placeholder="Cole a credencial aqui"
                        @input=${(e: Event) =>
                          props.onDraftChange(
                            selectedProviderId,
                            (e.target as HTMLInputElement).value,
                          )}
                      />
                    </label>
                  </div>
                  <div class="row" style="gap: 8px; margin-top: 8px;">
                    <button
                      class="btn primary"
                      ?disabled=${props.saving || props.testing}
                      @click=${() => props.onSaveCredential(selectedProviderId)}
                    >
                      ${props.saving ? "Salvando..." : "Salvar credencial"}
                    </button>
                    <button
                      class="btn"
                      ?disabled=${props.testing || props.saving}
                      @click=${() => props.onTestCredential(selectedProviderId)}
                    >
                      ${props.testing ? "Testando..." : "Testar credencial"}
                    </button>
                    <button
                      class="btn danger"
                      ?disabled=${props.saving || props.testing}
                      @click=${() => props.onDeleteCredential(selectedProviderId)}
                    >
                      Remover credencial
                    </button>
                  </div>
                  ${
                    currentProfileId
                      ? html`<div class="muted mono" style="margin-top: 8px;">profileId: ${currentProfileId}</div>`
                      : html`<div class="muted" style="margin-top: 8px;">Sem profileId salvo ainda.</div>`
                  }
                  ${
                    currentTest
                      ? html`
                          <div
                            class="callout ${currentTest.ok ? "" : "danger"}"
                            style="margin-top: 10px;"
                          >
                            ${currentTest.ok ? "Teste OK:" : "Teste falhou:"} ${currentTest.message}
                          </div>
                        `
                      : nothing
                  }

                  <div class="label" style="margin-top: 18px;">Modelos disponiveis</div>
                  <div class="list" style="margin-top: 8px; max-height: 280px; overflow: auto;">
                    ${
                      !selectedModels || selectedModels.models.length === 0
                        ? html`<div class="list-item muted">Sem modelos para este provider.</div>`
                        : selectedModels.models.map(
                            (model) => html`
                              <div class="list-item">
                                  <div class="list-main">
                                  <div class="list-title">${model.name?.trim() || model.id}</div>
                                  <div class="list-sub mono">${selectedProviderId}/${model.id}</div>
                                </div>
                                <div class="list-meta">
                                  <span class="chip">${model.source ?? "unknown"}</span>
                                  ${model.driverId ? html`<span class="chip">${model.driverId}</span>` : nothing}
                                  ${model.toolMode ? html`<span class="chip">tool mode</span>` : nothing}
                                </div>
                              </div>
                            `,
                          )
                    }
                  </div>
                `
          }
        </div>
      </div>
    </section>
  `;
}
