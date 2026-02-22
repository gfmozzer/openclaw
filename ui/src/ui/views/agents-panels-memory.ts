import { html } from "lit";
import { t } from "../../i18n/index.ts";
import type { AgentsFilesListResult } from "../types.ts";

export type AgentMemoryProps = {
  agentId: string;
  loading: boolean;
  error: string | null;
  filesList: AgentsFilesListResult | null;
  activeFile: string | null;
  fileContents: Record<string, string>;
  onLoadFiles: () => void;
  onOpenFile: (name: string) => void;
};

function isMemoryFile(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.includes("memory") ||
    normalized.includes("heartbeat") ||
    normalized.endsWith(".ltm.md")
  );
}

export function renderAgentMemory(props: AgentMemoryProps) {
  const listMatchesAgent = props.filesList?.agentId === props.agentId;
  const files = listMatchesAgent ? props.filesList?.files ?? [] : [];
  const memoryFiles = files.filter((file) => isMemoryFile(file.name));
  const selectedFile =
    props.activeFile && memoryFiles.some((file) => file.name === props.activeFile)
      ? props.activeFile
      : memoryFiles[0]?.name ?? null;
  const preview = selectedFile ? props.fileContents[selectedFile] : null;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 16px;">
        <div>
          <div class="card-title">${t("memoryPage.title")}</div>
          <div class="card-sub">${t("memoryPage.subtitle")}</div>
        </div>
        <button class="btn btn--sm" type="button" ?disabled=${props.loading} @click=${props.onLoadFiles}>
          ${props.loading ? t("memoryPage.loading") : t("common.refresh")}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-bottom: 12px;">${props.error}</div>` : ""}

      <div class="callout">
        <strong>${t("memoryPage.source")}:</strong> <code>agents.files.list/get</code> ${t("memoryPage.sourceSuffix")}
        <br />
        <span class="muted">
          ${t("memoryPage.futureNote")}
        </span>
      </div>

      <div class="row" style="gap: 14px; align-items: start; margin-top: 12px; flex-wrap: wrap;">
        <div style="min-width: 260px; flex: 1;">
          <div class="card-sub" style="margin-bottom: 8px;">${t("memoryPage.files")}</div>
          <div class="agent-list">
            ${
              memoryFiles.length === 0
                ? html`<div class="muted">${t("memoryPage.noFiles")}</div>`
                : memoryFiles.map(
                    (file) => html`
                      <button
                        type="button"
                        class="agent-row ${selectedFile === file.name ? "active" : ""}"
                        @click=${() => props.onOpenFile(file.name)}
                      >
                        <div class="agent-info">
                          <div class="agent-title">${file.name}</div>
                          <div class="agent-sub mono">${file.path}</div>
                        </div>
                        ${file.missing ? html`<span class="agent-pill">missing</span>` : ""}
                      </button>
                    `,
                  )
            }
          </div>
        </div>
        <div style="min-width: 380px; flex: 2;">
          <div class="card-sub" style="margin-bottom: 8px;">
            ${selectedFile ? `${t("memoryPage.preview")}: ${selectedFile}` : t("memoryPage.preview")}
          </div>
          <div class="card" style="min-height: 240px; padding: 12px;">
            ${
              !selectedFile
                ? html`<span class="muted">${t("memoryPage.selectFile")}</span>`
                : preview == null
                  ? html`<span class="muted">${t("memoryPage.clickToLoad")}</span>`
                  : html`<pre style="white-space: pre-wrap; margin: 0;">${preview}</pre>`
            }
          </div>
        </div>
      </div>
    </section>
  `;
}
