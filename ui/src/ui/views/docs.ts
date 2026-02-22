import { html } from "lit";
import { t } from "../../i18n/index.ts";

export type DocsViewProps = {
  basePath: string;
};

function ws(basePath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://gateway.example";
  return `${origin.replace(/^http/, "ws")}${basePath || ""}/ws`;
}

export function renderDocsView(props: DocsViewProps) {
  const wsUrl = ws(props.basePath);
  const cronAddExample = `{
  "method": "cron.add",
  "params": {
    "name": "relatorio-diario",
    "agentId": "supervisor",
    "schedule": { "kind": "every", "everyMs": 86400000 },
    "sessionTarget": "isolated",
    "wakeMode": "now",
  "payload": { "kind": "agentTurn", "message": "Gerar relatório diário" }
  }
}`;
  const trustedFrontdoorExample = `{
  "method": "chat.send",
  "params": {
    "sessionKey": "tenant-a:user-123",
    "message": "Resumo comercial da semana",
    "requestContext": {
      "requestSource": "trusted_frontdoor_api",
      "trustedFrontdoor": {
        "frontdoorId": "crm-main",
        "claims": {
          "tenantId": "tenant-a",
          "principalId": "user-123",
          "issuedAt": 1760000000000,
          "expiresAt": 1760000060000,
          "allowedOverrideFields": ["model", "skillAllowlist", "optimizationMode"]
        }
      }
    },
    "overrides": {
      "optimizationMode": "economy",
      "skillAllowlist": ["sales_report"]
    }
  }
}`;
  return html`
    <section class="card">
      <div class="card-title">${t("docsPage.title")}</div>
      <div class="card-sub">${t("docsPage.subtitle")}</div>
      <div class="callout" style="margin-top: 12px;">
        ${t("docsPage.hint")}
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">Enterprise Guides (Local)</div>
      <div class="card-sub">
        Guias operacionais mantidos em <span class="mono">.context/docs</span> para acompanhar
        roadmap/estado do projeto e integração segura de overrides.
      </div>
      <div class="list" style="margin-top: 10px;">
        <div class="list-item">
          <div class="list-main">
            <div class="list-title">Project Status & Roadmap Guide</div>
            <div class="list-sub mono">.context/docs/project-status-roadmap-guide.md</div>
            <div class="list-sub">
              Diferença entre status operacional no frontend e status real dos planos/workflows.
            </div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-main">
            <div class="list-title">Trusted Frontdoor Overrides Guide</div>
            <div class="list-sub mono">.context/docs/trusted-frontdoor-overrides-guide.md</div>
            <div class="list-sub">
              Como enviar overrides (fallback parcial + modo economia) via frontdoor confiável.
            </div>
          </div>
        </div>
      </div>
      <div class="card-sub" style="margin-top: 12px;">Payload de exemplo (trusted frontdoor)</div>
      <pre class="code-block" style="margin-top: 8px;"><code>${trustedFrontdoorExample}</code></pre>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">${t("docsPage.stackTitle")}</div>
      <div class="list" style="margin-top: 10px;">
        <div class="list-item">
          <div class="list-main">
            <div class="list-title mono">chat.portal.stack.status</div>
            <div class="list-sub">${t("docsPage.stackDesc")}</div>
          </div>
        </div>
        <div class="list-item">
          <div class="list-main">
            <div class="list-title mono">system.metrics</div>
            <div class="list-sub">${t("docsPage.metricsDesc")}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">${t("docsPage.jobsTitle")}</div>
      <div class="list" style="margin-top: 10px;">
        <div class="list-item"><div class="list-title mono">cron.status / cron.list</div></div>
        <div class="list-item"><div class="list-title mono">cron.add / cron.update / cron.remove</div></div>
        <div class="list-item"><div class="list-title mono">cron.run / cron.runs</div></div>
      </div>
      <pre class="code-block" style="margin-top: 12px;"><code>${cronAddExample}</code></pre>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">${t("docsPage.swarmTitle")}</div>
      <div class="list" style="margin-top: 10px;">
        <div class="list-item"><div class="list-title mono">swarm.team.list / swarm.team.get</div></div>
        <div class="list-item"><div class="list-title mono">swarm.team.upsert / swarm.team.delete</div></div>
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">${t("docsPage.skillsTitle")}</div>
      <div class="list" style="margin-top: 10px;">
        <div class="list-item"><div class="list-title mono">skills.status</div></div>
        <div class="list-item"><div class="list-title mono">skills.update</div></div>
        <div class="list-item"><div class="list-title mono">skills.install</div></div>
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card-title">${t("docsPage.wsTitle")}</div>
      <div class="card-sub">${t("docsPage.wsSubtitle")}</div>
      <pre class="code-block" style="margin-top: 12px;"><code>${wsUrl}</code></pre>
    </section>
  `;
}
