import { html } from "lit";

export type AgentMetricsProps = {
  agentId: string;
};

export function renderAgentMetrics(props: AgentMetricsProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
        <div>
          <div class="card-title">Runtime Metrics</div>
          <div class="card-sub">Real-time execution costs and logs</div>
        </div>
      </div>

      <div class="agents-overview-grid" style="margin-bottom: 16px;">
        <div class="agent-kv">
          <div class="label">Total Invocations</div>
          <div class="mono">1,402</div>
        </div>
        <div class="agent-kv">
          <div class="label">Total Tokens (in + out)</div>
          <div class="mono">4,124,050</div>
        </div>
        <div class="agent-kv">
          <div class="label">Est. Cost</div>
          <div class="mono" style="color: var(--success-text); font-weight: 500;">$14.28</div>
        </div>
      </div>
      
      <div class="callout warning">
        <strong>Cost Alert</strong><br>
        This estimate is based on the average OpenAI token metrics. It is not an exact billing invoice.
      </div>
    </section>
  `;
}
