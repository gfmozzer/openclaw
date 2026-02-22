import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import type { PortalContract } from "../types.ts";

type RichBlockType = "text" | "table" | "chart" | "dashboard" | "actions" | "html";

type RichEnvelope = {
  type: RichBlockType | string;
  specVersion?: string;
  renderer?: string;
  data?: unknown;
  layout?: unknown;
  permissionsHint?: {
    requiredScopes?: string[];
  };
};

type RichRenderContext = {
  contract: PortalContract | null;
  callerScopes: string[];
  onAction?: (payload: unknown, label?: string) => void;
};

type ActionItem = { label: string; payload?: unknown };

function normalizeEnvelope(value: unknown): RichEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string") {
    return null;
  }
  const type = record.type as RichBlockType | string;
  const isSupportedType = ["text", "table", "chart", "dashboard", "actions", "html"].includes(type);
  if (!isSupportedType) {
    return null;
  }
  const hasEnvelopeMeta =
    "data" in record || "layout" in record || "renderer" in record || "permissionsHint" in record;
  if (!hasEnvelopeMeta && type === "text") {
    return null;
  }
  const data =
    "data" in record
      ? record.data
      : type === "table" ||
          type === "chart" ||
          type === "dashboard" ||
          type === "actions" ||
          type === "html"
        ? record
        : undefined;
  return {
    type,
    specVersion: typeof record.specVersion === "string" ? record.specVersion : undefined,
    renderer: typeof record.renderer === "string" ? record.renderer : undefined,
    data,
    layout: record.layout,
    permissionsHint:
      record.permissionsHint && typeof record.permissionsHint === "object"
        ? (record.permissionsHint as RichEnvelope["permissionsHint"])
        : undefined,
  };
}

function parseEnvelopeJson(text: string): RichEnvelope | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    return normalizeEnvelope(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function extractRichEnvelopes(message: unknown): RichEnvelope[] {
  const result: RichEnvelope[] = [];
  if (!message || typeof message !== "object") {
    return result;
  }
  const entry = message as Record<string, unknown>;
  const content = entry.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const block = item as Record<string, unknown>;
      const direct = normalizeEnvelope(block);
      if (direct) {
        result.push(direct);
        continue;
      }
      if (typeof block.text === "string") {
        const parsed = parseEnvelopeJson(block.text);
        if (parsed) {
          result.push(parsed);
        }
      }
    }
  } else if (typeof content === "string") {
    const parsed = parseEnvelopeJson(content);
    if (parsed) {
      result.push(parsed);
    }
  }
  return result;
}

function rendererAllowed(contract: PortalContract | null, renderer: string | undefined): boolean {
  if (!renderer) {
    return true;
  }
  const allowed = contract?.richBlocks?.allowedRenderers;
  if (!Array.isArray(allowed) || allowed.length === 0) {
    return true;
  }
  return allowed.includes(renderer);
}

function hasRequiredScopes(required: string[] | undefined, callerScopes: string[]): boolean {
  if (!required || required.length === 0) {
    return true;
  }
  const set = new Set(callerScopes.map((scope) => scope.trim()).filter(Boolean));
  return required.every((scope) => set.has(scope));
}

function defaultRendererForType(type: RichBlockType | string): string | undefined {
  if (type === "html") {
    return "html-sandboxed";
  }
  return undefined;
}

function renderTable(data: unknown): TemplateResult {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const columns = Array.isArray(payload.columns) ? payload.columns.map((x) => String(x)) : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return html`<div class="chat-rich-block__empty">No table data</div>`;
  }
  return html`
    <div class="chat-rich-table-wrap">
      <table class="chat-rich-table">
        <thead>
          <tr>${columns.map((column) => html`<th>${column}</th>`)}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const values = Array.isArray(row) ? row : [];
            return html`<tr>${columns.map((_, idx) => html`<td>${String(values[idx] ?? "")}</td>`)}</tr>`;
          })}
        </tbody>
      </table>
    </div>
  `;
}

function renderChart(data: unknown): TemplateResult {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const labels = Array.isArray(payload.labels) ? payload.labels.map((x) => String(x)) : [];
  const valuesRaw = Array.isArray(payload.values) ? payload.values : [];
  const values = valuesRaw.map((value) => (typeof value === "number" ? value : Number(value) || 0));
  const max = Math.max(1, ...values);
  if (labels.length === 0 || values.length === 0) {
    return html`<div class="chat-rich-block__empty">No chart data</div>`;
  }
  return html`
    <div class="chat-rich-chart">
      ${labels.map((label, index) => {
        const value = values[index] ?? 0;
        const percent = Math.max(4, Math.round((value / max) * 100));
        return html`
          <div class="chat-rich-chart__row">
            <span class="chat-rich-chart__label">${label}</span>
            <div class="chat-rich-chart__bar-wrap">
              <div class="chat-rich-chart__bar" style=${`width:${percent}%`}></div>
            </div>
            <span class="chat-rich-chart__value">${value}</span>
          </div>
        `;
      })}
    </div>
  `;
}

function renderDashboard(data: unknown): TemplateResult {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  if (cards.length === 0) {
    return html`<div class="chat-rich-block__empty">No dashboard cards</div>`;
  }
  return html`
    <div class="chat-rich-dashboard">
      ${cards.map((card) => {
        const entry = (card && typeof card === "object" ? card : {}) as Record<string, unknown>;
        return html`
          <div class="chat-rich-dashboard__card">
            <div class="chat-rich-dashboard__title">${String(entry.title ?? "Metric")}</div>
            <div class="chat-rich-dashboard__value">${String(entry.value ?? "-")}</div>
            ${entry.subtitle ? html`<div class="chat-rich-dashboard__subtitle">${String(entry.subtitle)}</div>` : nothing}
          </div>
        `;
      })}
    </div>
  `;
}

function renderActions(data: unknown, onAction?: (payload: unknown, label?: string) => void): TemplateResult {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const actions = Array.isArray(payload.actions) ? (payload.actions as ActionItem[]) : [];
  if (actions.length === 0) {
    return html`<div class="chat-rich-block__empty">No actions</div>`;
  }
  return html`
    <div class="chat-rich-actions">
      ${actions.map((action) => {
        const label = String((action as Record<string, unknown>).label ?? "Action");
        const actionPayload = (action as Record<string, unknown>).payload;
        return html`
          <button
            class="btn btn--sm"
            ?disabled=${!onAction}
            @click=${() => onAction?.(actionPayload, label)}
          >
            ${label}
          </button>
        `;
      })}
    </div>
  `;
}

function renderHtml(data: unknown, contract: PortalContract | null): TemplateResult {
  const policy = contract?.richBlocks?.htmlPolicy;
  if (policy?.sandboxed === false || policy?.allowScripts === true) {
    return html`<div class="chat-rich-block__blocked">Blocked by HTML policy.</div>`;
  }
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const sourceHtml = typeof payload.html === "string" ? payload.html : "";
  if (!sourceHtml.trim()) {
    return html`<div class="chat-rich-block__empty">Empty HTML block</div>`;
  }
  const sanitized = toSanitizedMarkdownHtml(sourceHtml);
  return html`
    <iframe
      class="chat-rich-html"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      srcdoc=${sanitized}
    ></iframe>
  `;
}

function renderEnvelope(envelope: RichEnvelope, ctx: RichRenderContext): TemplateResult {
  const requiredScopes = envelope.permissionsHint?.requiredScopes;
  if (!hasRequiredScopes(requiredScopes, ctx.callerScopes)) {
    return html`<div class="chat-rich-block__blocked">Restricted block. Missing scope.</div>`;
  }
  const renderer = envelope.renderer ?? defaultRendererForType(envelope.type);
  if (!rendererAllowed(ctx.contract, renderer)) {
    return html`<div class="chat-rich-block__blocked">Renderer not allowed.</div>`;
  }
  const content = (() => {
    switch (envelope.type) {
      case "text":
        return html`<div class="chat-rich-text">${unsafeHTML(toSanitizedMarkdownHtml(String((envelope.data as Record<string, unknown> | null)?.text ?? "")))}</div>`;
      case "table":
        return renderTable(envelope.data);
      case "chart":
        return renderChart(envelope.data);
      case "dashboard":
        return renderDashboard(envelope.data);
      case "actions":
        return renderActions(envelope.data, ctx.onAction);
      case "html":
        return renderHtml(envelope.data, ctx.contract);
      default:
        return html`<div class="chat-rich-block__fallback">Unsupported block type: <code>${envelope.type}</code></div>`;
    }
  })();
  return html`
    <div class="chat-rich-block">
      <div class="chat-rich-block__header">
        <span class="chat-rich-block__type">${envelope.type}</span>
        ${renderer ? html`<span class="chat-rich-block__renderer">${renderer}</span>` : nothing}
      </div>
      ${content}
    </div>
  `;
}

export function renderRichBlocksFromMessage(
  message: unknown,
  context: RichRenderContext,
): TemplateResult | typeof nothing {
  const envelopes = extractRichEnvelopes(message);
  if (envelopes.length === 0) {
    return nothing;
  }
  return html`${envelopes.map((envelope) => renderEnvelope(envelope, context))}`;
}
