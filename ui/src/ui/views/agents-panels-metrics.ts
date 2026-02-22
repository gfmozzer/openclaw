import { html } from "lit";
import { t } from "../../i18n/index.ts";
import { formatMs } from "../format.ts";
import type { EnterpriseMetricsSnapshot } from "../types.ts";

export type AgentMetricsProps = {
  agentId: string;
  loading: boolean;
  error: string | null;
  snapshot: EnterpriseMetricsSnapshot | null;
  onRefresh: () => void;
};

export function renderAgentMetrics(props: AgentMetricsProps) {
  const counters = props.snapshot?.counters ?? {};
  const entries = Object.entries(counters).sort((a, b) => a[0].localeCompare(b[0]));
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
        <div>
          <div class="card-title">${t("metricsPage.title")}</div>
          <div class="card-sub">${t("metricsPage.subtitle")} <code>system.metrics</code></div>
        </div>
        <button class="btn btn--sm" type="button" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("metricsPage.loading") : t("common.refresh")}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>` : ""}

      <div class="callout" style="margin-bottom: 12px;">
        <strong>${t("metricsPage.scope")}:</strong> ${t("metricsPage.globalRuntime")}
        <br />
        <span class="muted">${t("metricsPage.selectedAgent", { id: props.agentId })}</span>
        <br />
        <span class="muted">
          ${t("metricsPage.lastUpdate")}
          ${props.snapshot?.generatedAt ? formatMs(props.snapshot.generatedAt) : "n/a"}
        </span>
      </div>

      ${
        entries.length === 0
          ? html`<div class="muted">${t("metricsPage.noMetrics")}</div>`
          : html`
              <div class="agents-overview-grid">
                ${entries.map(
                  ([name, value]) => html`
                    <div class="agent-kv">
                      <div class="label">${name}</div>
                      <div class="mono">${value}</div>
                    </div>
                  `,
                )}
              </div>
            `
      }
    </section>
  `;
}
