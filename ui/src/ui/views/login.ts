import { html } from "lit";

export function renderLogin(props: {
  gatewayUrl: string;
  token: string;
  onConnect: (url: string, token: string) => void;
}) {
  let url = props.gatewayUrl || "http://localhost:19001";
  let token = props.token || "";

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card" style="width: 400px;">
        <div class="exec-approval-header" style="flex-direction: column; align-items: center; text-align: center; gap: 16px;">
          <div class="brand-logo">
            <img src="/logo.png" alt="Automadesk Agents" style="width: 64px; height: 64px;" />
          </div>
          <div>
            <div class="exec-approval-title">Automadesk Agents</div>
            <div class="exec-approval-sub">Connect to your Agent Gateway</div>
          </div>
        </div>
        
        <div style="margin-top: 24px;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 13px; margin-bottom: 8px; font-weight: 500;">Gateway URL</label>
            <input
              type="text"
              class="input"
              style="width: 100%; box-sizing: border-box;"
              .value=${url}
              @input=${(e: Event) => (url = (e.target as HTMLInputElement).value)}
              placeholder="http://localhost:19001"
            />
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 13px; margin-bottom: 8px; font-weight: 500;">Access Token</label>
            <input
              type="password"
              class="input"
              style="width: 100%; box-sizing: border-box;"
              .value=${token}
              @input=${(e: Event) => (token = (e.target as HTMLInputElement).value)}
              placeholder="Your Gateway Token"
            />
          </div>
          <button
            class="btn primary"
            style="width: 100%; justify-content: center; padding: 12px; font-size: 16px;"
            @click=${() => props.onConnect(url, token)}
          >
            Connect to Gateway
          </button>
        </div>
      </div>
    </div>
  `;
}
