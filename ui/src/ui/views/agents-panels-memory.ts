import { html } from "lit";

export type AgentMemoryProps = {
  agentId: string;
};

export function renderAgentMemory(props: AgentMemoryProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
        <div>
          <div class="card-title">Memory (LTM)</div>
          <div class="card-sub">Long Term Memory and Storage management</div>
        </div>
      </div>
      
      <div class="callout primary">
        <strong>Memory Storage</strong><br>
        View documents stored in S3 and historical JSONB context saved in PostgreSQL for this agent.
      </div>

      <div class="agent-tabs" style="margin-top: 16px;">
        <button class="agent-tab active" type="button">S3 File Explorer</button>
        <button class="agent-tab" type="button">PostgreSQL LTM (JSONB)</button>
      </div>
      
      <div class="card" style="margin-top: 16px; min-height: 200px; display: flex; align-items: center; justify-content: center;">
        <span class="muted">No memories stored yet.</span>
      </div>
    </section>
  `;
}
