import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CURRENT_SESSION_VERSION, SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveDriverRuntime } from "../../agents/driver-runtime.js";
import { DEFAULT_DRIVER_ID, formatModelRoute, parseModelRouteRef } from "../../agents/model-route.js";
import { resolveThinkingDefault } from "../../agents/model-selection.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import { createReplyPrefixOptions } from "../../channels/reply-prefix.js";
import { resolveSessionFilePath } from "../../config/sessions.js";
import { resolveSendPolicy } from "../../sessions/send-policy.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import { ADMIN_SCOPE } from "../method-scopes.js";
import {
  abortChatRunById,
  abortChatRunsForSessionKey,
  type ChatAbortControllerEntry,
  type ChatAbortOps,
  isChatStopCommandText,
  resolveChatRunExpiresAtMs,
} from "../chat-abort.js";
import { type ChatImageContent, parseMessageWithAttachments } from "../chat-attachments.js";
import { stripEnvelopeFromMessages } from "../chat-sanitize.js";
import { GATEWAY_CLIENT_CAPS, hasGatewayClientCap } from "../protocol/client-info.js";
import { incrementEnterpriseMetric } from "../runtime-metrics.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatAbortParams,
  validateChatHistoryParams,
  validateChatInjectParams,
  validateChatSendParams,
} from "../protocol/index.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  loadSessionEntry,
  readSessionMessages,
  resolveSessionModelRoute,
  resolveSessionModelRef,
} from "../session-utils.js";
import { formatForLog } from "../ws-log.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";
import { normalizeRpcAttachmentsToChatAttachments } from "./attachment-normalize.js";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
import type { IdempotencyScope } from "../stateless/contracts/idempotency-store.js";
import type { MemoryScope } from "../stateless/contracts/memory-store.js";

type TranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

type AppendMessageArg = Parameters<SessionManager["appendMessage"]>[0];
type AbortOrigin = "rpc" | "stop-command";

type AbortedPartialSnapshot = {
  runId: string;
  sessionId: string;
  text: string;
  abortOrigin: AbortOrigin;
};

type ChatRequestOverrides = {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  soul?: string;
  apiKey?: string;
  authProfileId?: string;
  skillAllowlist?: string[];
};

type ChatObservedModelRoute = {
  driver: string;
  provider: string;
  model: string;
  modelRoute: string;
};

function sanitizeChatRequestOverrides(raw: unknown): ChatRequestOverrides | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const input = raw as Record<string, unknown>;
  const trimString = (value: unknown, max: number): string | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return trimmed.slice(0, max);
  };
  const overrides: ChatRequestOverrides = {
    provider: trimString(input.provider, 200),
    model: trimString(input.model, 200),
    systemPrompt: trimString(input.systemPrompt, 12_000),
    soul: trimString(input.soul, 12_000),
    apiKey: trimString(input.apiKey, 8_192),
    authProfileId: trimString(input.authProfileId, 200),
    skillAllowlist: Array.isArray(input.skillAllowlist)
      ? input.skillAllowlist
          .map((entry) => (typeof entry === "string" ? entry.trim().slice(0, 200) : ""))
          .filter((entry) => Boolean(entry))
      : undefined,
  };
  if (
    !overrides.provider &&
    !overrides.model &&
    !overrides.systemPrompt &&
    !overrides.soul &&
    !overrides.apiKey &&
    !overrides.authProfileId &&
    !overrides.skillAllowlist
  ) {
    return undefined;
  }
  return overrides;
}

function resolveObservedModelRoute(params: {
  cfg: ReturnType<typeof loadSessionEntry>["cfg"];
  entry: ReturnType<typeof loadSessionEntry>["entry"];
  agentId: string;
  requestOverrides?: ChatRequestOverrides;
}): ChatObservedModelRoute {
  const base = resolveSessionModelRoute({
    cfg: params.cfg,
    entry: params.entry ?? undefined,
    agentId: params.agentId,
  });
  const overrideProvider = params.requestOverrides?.provider?.trim().toLowerCase();
  const overrideModelRaw = params.requestOverrides?.model?.trim();
  if (!overrideProvider && !overrideModelRaw) {
    return {
      driver: base.driver,
      provider: base.provider,
      model: base.model,
      modelRoute: formatModelRoute(
        {
          driver: base.driver,
          provider: base.provider,
          model: base.model,
        },
        { includeNativeDriver: true },
      ),
    };
  }

  const defaultProvider = overrideProvider || base.provider;
  const modelRaw = overrideModelRaw || base.model;
  const parsed = parseModelRouteRef({
    raw: modelRaw,
    defaultProvider,
    defaultDriver: DEFAULT_DRIVER_ID,
  });
  if (parsed) {
    return {
      driver: parsed.driver,
      provider: parsed.provider,
      model: parsed.model,
      modelRoute: formatModelRoute(parsed, { includeNativeDriver: true }),
    };
  }

  return {
    driver: DEFAULT_DRIVER_ID,
    provider: defaultProvider,
    model: modelRaw,
    modelRoute: formatModelRoute(
      {
        driver: DEFAULT_DRIVER_ID,
        provider: defaultProvider,
        model: modelRaw,
      },
      { includeNativeDriver: true },
    ),
  };
}

function hasScope(scopes: readonly string[] | undefined, scope: string): boolean {
  return Array.isArray(scopes) && scopes.includes(scope);
}

function looksLikeDashboardPayload(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("```dashboard") ||
    normalized.includes('"type":"dashboard"') ||
    normalized.includes('"type": "dashboard"')
  );
}

const CHAT_HISTORY_TEXT_MAX_CHARS = 12_000;
const CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES = 128 * 1024;
const CHAT_HISTORY_OVERSIZED_PLACEHOLDER = "[chat.history omitted: message too large]";
let chatHistoryPlaceholderEmitCount = 0;

function stripDisallowedChatControlChars(message: string): string {
  let output = "";
  for (const char of message) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      output += char;
    }
  }
  return output;
}

export function sanitizeChatSendMessageInput(
  message: string,
): { ok: true; message: string } | { ok: false; error: string } {
  const normalized = message.normalize("NFC");
  if (normalized.includes("\u0000")) {
    return { ok: false, error: "message must not contain null bytes" };
  }
  return { ok: true, message: stripDisallowedChatControlChars(normalized) };
}

function truncateChatHistoryText(text: string): { text: string; truncated: boolean } {
  if (text.length <= CHAT_HISTORY_TEXT_MAX_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, CHAT_HISTORY_TEXT_MAX_CHARS)}\n...(truncated)...`,
    truncated: true,
  };
}

function sanitizeChatHistoryContentBlock(block: unknown): { block: unknown; changed: boolean } {
  if (!block || typeof block !== "object") {
    return { block, changed: false };
  }
  const entry = { ...(block as Record<string, unknown>) };
  let changed = false;
  if (typeof entry.text === "string") {
    const res = truncateChatHistoryText(entry.text);
    entry.text = res.text;
    changed ||= res.truncated;
  }
  if (typeof entry.partialJson === "string") {
    const res = truncateChatHistoryText(entry.partialJson);
    entry.partialJson = res.text;
    changed ||= res.truncated;
  }
  if (typeof entry.arguments === "string") {
    const res = truncateChatHistoryText(entry.arguments);
    entry.arguments = res.text;
    changed ||= res.truncated;
  }
  if (typeof entry.thinking === "string") {
    const res = truncateChatHistoryText(entry.thinking);
    entry.thinking = res.text;
    changed ||= res.truncated;
  }
  if ("thinkingSignature" in entry) {
    delete entry.thinkingSignature;
    changed = true;
  }
  const type = typeof entry.type === "string" ? entry.type : "";
  if (type === "image" && typeof entry.data === "string") {
    const bytes = Buffer.byteLength(entry.data, "utf8");
    delete entry.data;
    entry.omitted = true;
    entry.bytes = bytes;
    changed = true;
  }
  return { block: changed ? entry : block, changed };
}

function sanitizeChatHistoryMessage(message: unknown): { message: unknown; changed: boolean } {
  if (!message || typeof message !== "object") {
    return { message, changed: false };
  }
  const entry = { ...(message as Record<string, unknown>) };
  let changed = false;

  if ("details" in entry) {
    delete entry.details;
    changed = true;
  }
  if ("usage" in entry) {
    delete entry.usage;
    changed = true;
  }
  if ("cost" in entry) {
    delete entry.cost;
    changed = true;
  }

  if (typeof entry.content === "string") {
    const res = truncateChatHistoryText(entry.content);
    entry.content = res.text;
    changed ||= res.truncated;
  } else if (Array.isArray(entry.content)) {
    const updated = entry.content.map((block) => sanitizeChatHistoryContentBlock(block));
    if (updated.some((item) => item.changed)) {
      entry.content = updated.map((item) => item.block);
      changed = true;
    }
  }

  if (typeof entry.text === "string") {
    const res = truncateChatHistoryText(entry.text);
    entry.text = res.text;
    changed ||= res.truncated;
  }

  return { message: changed ? entry : message, changed };
}

function sanitizeChatHistoryMessages(messages: unknown[]): unknown[] {
  if (messages.length === 0) {
    return messages;
  }
  let changed = false;
  const next = messages.map((message) => {
    const res = sanitizeChatHistoryMessage(message);
    changed ||= res.changed;
    return res.message;
  });
  return changed ? next : messages;
}

function jsonUtf8Bytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

function buildOversizedHistoryPlaceholder(message?: unknown): Record<string, unknown> {
  const role =
    message &&
    typeof message === "object" &&
    typeof (message as { role?: unknown }).role === "string"
      ? (message as { role: string }).role
      : "assistant";
  const timestamp =
    message &&
    typeof message === "object" &&
    typeof (message as { timestamp?: unknown }).timestamp === "number"
      ? (message as { timestamp: number }).timestamp
      : Date.now();
  return {
    role,
    timestamp,
    content: [{ type: "text", text: CHAT_HISTORY_OVERSIZED_PLACEHOLDER }],
    __openclaw: { truncated: true, reason: "oversized" },
  };
}

function replaceOversizedChatHistoryMessages(params: {
  messages: unknown[];
  maxSingleMessageBytes: number;
}): { messages: unknown[]; replacedCount: number } {
  const { messages, maxSingleMessageBytes } = params;
  if (messages.length === 0) {
    return { messages, replacedCount: 0 };
  }
  let replacedCount = 0;
  const next = messages.map((message) => {
    if (jsonUtf8Bytes(message) <= maxSingleMessageBytes) {
      return message;
    }
    replacedCount += 1;
    return buildOversizedHistoryPlaceholder(message);
  });
  return { messages: replacedCount > 0 ? next : messages, replacedCount };
}

function enforceChatHistoryFinalBudget(params: { messages: unknown[]; maxBytes: number }): {
  messages: unknown[];
  placeholderCount: number;
} {
  const { messages, maxBytes } = params;
  if (messages.length === 0) {
    return { messages, placeholderCount: 0 };
  }
  if (jsonUtf8Bytes(messages) <= maxBytes) {
    return { messages, placeholderCount: 0 };
  }
  const last = messages.at(-1);
  if (last && jsonUtf8Bytes([last]) <= maxBytes) {
    return { messages: [last], placeholderCount: 0 };
  }
  const placeholder = buildOversizedHistoryPlaceholder(last);
  if (jsonUtf8Bytes([placeholder]) <= maxBytes) {
    return { messages: [placeholder], placeholderCount: 1 };
  }
  return { messages: [], placeholderCount: 0 };
}

function resolveChatStatelessScope(params: {
  context: GatewayRequestContext;
  sessionKey: string;
  cfg: ReturnType<typeof loadSessionEntry>["cfg"];
}): MemoryScope | null {
  const tenantId = params.context.tenantContext?.tenantId ?? params.context.enterprisePrincipal?.tenantId;
  if (!tenantId) {
    return null;
  }
  const agentId = resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  return { tenantId, agentId, sessionKey: params.sessionKey };
}

function normalizeMemoryContentAsChatMessage(content: unknown, role: string, timestamp: number): unknown {
  if (content && typeof content === "object") {
    const asRecord = content as Record<string, unknown>;
    if (typeof asRecord.role === "string" && "content" in asRecord) {
      return asRecord;
    }
  }
  return {
    role,
    timestamp,
    content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content) }],
  };
}

async function readChatHistoryFromStatelessMemory(params: {
  context: GatewayRequestContext;
  scope: MemoryScope;
  limit: number;
}): Promise<unknown[]> {
  const store = params.context.memoryStore;
  if (!store) {
    return [];
  }
  const rows = await store.list(params.scope, { limit: params.limit });
  return rows.map((row) =>
    normalizeMemoryContentAsChatMessage(row.content, row.role, row.timestamp),
  );
}

function resolveTranscriptPath(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
}): string | null {
  const { sessionId, storePath, sessionFile, agentId } = params;
  if (!storePath && !sessionFile) {
    return null;
  }
  try {
    const sessionsDir = storePath ? path.dirname(storePath) : undefined;
    return resolveSessionFilePath(
      sessionId,
      sessionFile ? { sessionFile } : undefined,
      sessionsDir || agentId ? { sessionsDir, agentId } : undefined,
    );
  } catch {
    return null;
  }
}

function ensureTranscriptFile(params: { transcriptPath: string; sessionId: string }): {
  ok: boolean;
  error?: string;
} {
  if (fs.existsSync(params.transcriptPath)) {
    return { ok: true };
  }
  try {
    fs.mkdirSync(path.dirname(params.transcriptPath), { recursive: true });
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: params.sessionId,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
    };
    fs.writeFileSync(params.transcriptPath, `${JSON.stringify(header)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function transcriptHasIdempotencyKey(transcriptPath: string, idempotencyKey: string): boolean {
  try {
    const lines = fs.readFileSync(transcriptPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as { message?: { idempotencyKey?: unknown } };
      if (parsed?.message?.idempotencyKey === idempotencyKey) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function appendAssistantTranscriptMessage(params: {
  context?: GatewayRequestContext;
  cfg?: ReturnType<typeof loadSessionEntry>["cfg"];
  message: string;
  label?: string;
  sessionId: string;
  sessionKey?: string;
  storePath: string | undefined;
  sessionFile?: string;
  agentId?: string;
  createIfMissing?: boolean;
  idempotencyKey?: string;
  abortMeta?: {
    aborted: true;
    origin: AbortOrigin;
    runId: string;
  };
}): Promise<TranscriptAppendResult> {
  if (params.context && params.sessionKey) {
    const cfg = params.cfg ?? loadSessionEntry(params.sessionKey).cfg;
    const scope = resolveChatStatelessScope({
      context: params.context,
      sessionKey: params.sessionKey,
      cfg,
    });
    if (scope && params.context.memoryStore) {
      const now = Date.now();
      const labelPrefix = params.label ? `[${params.label}]\n\n` : "";
      const usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      };
      const messageBody: AppendMessageArg & Record<string, unknown> = {
        role: "assistant",
        content: [{ type: "text", text: `${labelPrefix}${params.message}` }],
        timestamp: now,
        stopReason: "stop",
        usage,
        api: "openai-responses",
        provider: "openclaw",
        model: "gateway-injected",
        ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
        ...(params.abortMeta
          ? {
              openclawAbort: {
                aborted: true,
                origin: params.abortMeta.origin,
                runId: params.abortMeta.runId,
              },
            }
          : {}),
      };
      const appendId = randomUUID();
      await params.context.memoryStore.append({
        id: appendId,
        scope,
        role: "assistant",
        content: messageBody,
        timestamp: now,
        runId: params.abortMeta?.runId,
        metadata: params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
      });
      return { ok: true, messageId: appendId, message: messageBody };
    }
  }

  const transcriptPath = resolveTranscriptPath({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
    agentId: params.agentId,
  });
  if (!transcriptPath) {
    return { ok: false, error: "transcript path not resolved" };
  }

  if (!fs.existsSync(transcriptPath)) {
    if (!params.createIfMissing) {
      return { ok: false, error: "transcript file not found" };
    }
    const ensured = ensureTranscriptFile({
      transcriptPath,
      sessionId: params.sessionId,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error ?? "failed to create transcript file" };
    }
  }

  if (params.idempotencyKey && transcriptHasIdempotencyKey(transcriptPath, params.idempotencyKey)) {
    return { ok: true };
  }

  const now = Date.now();
  const labelPrefix = params.label ? `[${params.label}]\n\n` : "";
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
  const messageBody: AppendMessageArg & Record<string, unknown> = {
    role: "assistant",
    content: [{ type: "text", text: `${labelPrefix}${params.message}` }],
    timestamp: now,
    // Pi stopReason is a strict enum; this is not model output, but we still store it as a
    // normal assistant message so it participates in the session parentId chain.
    stopReason: "stop",
    usage,
    // Make these explicit so downstream tooling never treats this as model output.
    api: "openai-responses",
    provider: "openclaw",
    model: "gateway-injected",
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    ...(params.abortMeta
      ? {
          openclawAbort: {
            aborted: true,
            origin: params.abortMeta.origin,
            runId: params.abortMeta.runId,
          },
        }
      : {}),
  };

  try {
    // IMPORTANT: Use SessionManager so the entry is attached to the current leaf via parentId.
    // Raw jsonl appends break the parent chain and can hide compaction summaries from context.
    const sessionManager = SessionManager.open(transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function collectSessionAbortPartials(params: {
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  chatRunBuffers: Map<string, string>;
  sessionKey: string;
  abortOrigin: AbortOrigin;
}): AbortedPartialSnapshot[] {
  const out: AbortedPartialSnapshot[] = [];
  for (const [runId, active] of params.chatAbortControllers) {
    if (active.sessionKey !== params.sessionKey) {
      continue;
    }
    const text = params.chatRunBuffers.get(runId);
    if (!text || !text.trim()) {
      continue;
    }
    out.push({
      runId,
      sessionId: active.sessionId,
      text,
      abortOrigin: params.abortOrigin,
    });
  }
  return out;
}

async function persistAbortedPartials(params: {
  context: GatewayRequestContext;
  sessionKey: string;
  snapshots: AbortedPartialSnapshot[];
}): Promise<void> {
  if (params.snapshots.length === 0) {
    return;
  }
  const { cfg, storePath, entry } = loadSessionEntry(params.sessionKey);
  for (const snapshot of params.snapshots) {
    const sessionId = entry?.sessionId ?? snapshot.sessionId ?? snapshot.runId;
    const appended = await appendAssistantTranscriptMessage({
      context: params.context,
      cfg,
      message: snapshot.text,
      sessionId,
      sessionKey: params.sessionKey,
      storePath,
      sessionFile: entry?.sessionFile,
      createIfMissing: true,
      idempotencyKey: `${snapshot.runId}:assistant`,
      abortMeta: {
        aborted: true,
        origin: snapshot.abortOrigin,
        runId: snapshot.runId,
      },
    });
    if (!appended.ok) {
      params.context.logGateway.warn(
        `chat.abort transcript append failed: ${appended.error ?? "unknown error"}`,
      );
    }
  }
}

function createChatAbortOps(context: GatewayRequestContext): ChatAbortOps {
  return {
    chatAbortControllers: context.chatAbortControllers,
    chatRunBuffers: context.chatRunBuffers,
    chatDeltaSentAt: context.chatDeltaSentAt,
    chatAbortedRuns: context.chatAbortedRuns,
    removeChatRun: context.removeChatRun,
    agentRunSeq: context.agentRunSeq,
    broadcast: context.broadcast,
    nodeSendToSession: context.nodeSendToSession,
  };
}

function abortChatRunsForSessionKeyWithPartials(params: {
  context: GatewayRequestContext;
  ops: ChatAbortOps;
  sessionKey: string;
  abortOrigin: AbortOrigin;
  stopReason?: string;
}): Promise<ReturnType<typeof abortChatRunsForSessionKey>> {
  const snapshots = collectSessionAbortPartials({
    chatAbortControllers: params.context.chatAbortControllers,
    chatRunBuffers: params.context.chatRunBuffers,
    sessionKey: params.sessionKey,
    abortOrigin: params.abortOrigin,
  });
  const res = abortChatRunsForSessionKey(params.ops, {
    sessionKey: params.sessionKey,
    stopReason: params.stopReason,
  });
  if (res.aborted) {
    return persistAbortedPartials({
      context: params.context,
      sessionKey: params.sessionKey,
      snapshots,
    }).then(() => res);
  }
  return Promise.resolve(res);
}

function nextChatSeq(context: { agentRunSeq: Map<string, number> }, runId: string) {
  const next = (context.agentRunSeq.get(runId) ?? 0) + 1;
  context.agentRunSeq.set(runId, next);
  return next;
}

function broadcastChatFinal(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  message?: Record<string, unknown>;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "final" as const,
    message: params.message,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
  params.context.agentRunSeq.delete(params.runId);
}

function broadcastChatError(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  errorMessage?: string;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "error" as const,
    errorMessage: params.errorMessage,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
  params.context.agentRunSeq.delete(params.runId);
}

async function publishChatBusEvent(params: {
  context: GatewayRequestContext;
  topic: string;
  sessionKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const tenantId =
    params.context.tenantContext?.tenantId ?? params.context.enterprisePrincipal?.tenantId;
  if (!tenantId || !params.context.messageBus) {
    return;
  }
  await params.context.messageBus.publish({
    id: randomUUID(),
    topic: params.topic,
    tenantId,
    timestamp: Date.now(),
    payload: {
      sessionKey: params.sessionKey,
      ...params.payload,
    },
  });
}

export const chatHandlers: GatewayRequestHandlers = {
  "chat.history": async ({ params, respond, context }) => {
    if (!validateChatHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.history params: ${formatValidationErrors(validateChatHistoryParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit } = params as {
      sessionKey: string;
      limit?: number;
    };
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const statelessScope = resolveChatStatelessScope({ context, sessionKey, cfg });
    const sessionId = entry?.sessionId ?? statelessScope?.sessionKey;
    const hardMax = 1000;
    const defaultLimit = 200;
    const requested = typeof limit === "number" ? limit : defaultLimit;
    const max = Math.min(hardMax, requested);
    const rawMessages =
      statelessScope && context.memoryStore
        ? await readChatHistoryFromStatelessMemory({
            context,
            scope: statelessScope,
            limit: max,
          })
        : sessionId && storePath
          ? readSessionMessages(sessionId, storePath, entry?.sessionFile)
          : [];
    const sliced = rawMessages.length > max ? rawMessages.slice(-max) : rawMessages;
    const sanitized = stripEnvelopeFromMessages(sliced);
    const normalized = sanitizeChatHistoryMessages(sanitized);
    const maxHistoryBytes = getMaxChatHistoryMessagesBytes();
    const perMessageHardCap = Math.min(CHAT_HISTORY_MAX_SINGLE_MESSAGE_BYTES, maxHistoryBytes);
    const replaced = replaceOversizedChatHistoryMessages({
      messages: normalized,
      maxSingleMessageBytes: perMessageHardCap,
    });
    const capped = capArrayByJsonBytes(replaced.messages, maxHistoryBytes).items;
    const bounded = enforceChatHistoryFinalBudget({ messages: capped, maxBytes: maxHistoryBytes });
    const placeholderCount = replaced.replacedCount + bounded.placeholderCount;
    if (placeholderCount > 0) {
      chatHistoryPlaceholderEmitCount += placeholderCount;
      context.logGateway.debug(
        `chat.history omitted oversized payloads placeholders=${placeholderCount} total=${chatHistoryPlaceholderEmitCount}`,
      );
    }
    let thinkingLevel = entry?.thinkingLevel;
    if (!thinkingLevel) {
      const configured = cfg.agents?.defaults?.thinkingDefault;
      if (configured) {
        thinkingLevel = configured;
      } else {
        const sessionAgentId = resolveSessionAgentId({ sessionKey, config: cfg });
        const { provider, model } = resolveSessionModelRef(cfg, entry, sessionAgentId);
        const catalog = await context.loadGatewayModelCatalog();
        thinkingLevel = resolveThinkingDefault({
          cfg,
          provider,
          model,
          catalog,
        });
      }
    }
    const verboseLevel = entry?.verboseLevel ?? cfg.agents?.defaults?.verboseDefault;
    respond(true, {
      sessionKey,
      sessionId,
      messages: bounded.messages,
      thinkingLevel,
      verboseLevel,
    });
  },
  "chat.abort": async ({ params, respond, context }) => {
    if (!validateChatAbortParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.abort params: ${formatValidationErrors(validateChatAbortParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey: rawSessionKey, runId } = params as {
      sessionKey: string;
      runId?: string;
    };

    const ops = createChatAbortOps(context);

    if (!runId) {
      const res = await abortChatRunsForSessionKeyWithPartials({
        context,
        ops,
        sessionKey: rawSessionKey,
        abortOrigin: "rpc",
        stopReason: "rpc",
      });
      await publishChatBusEvent({
        context,
        topic: "chat.aborted",
        sessionKey: rawSessionKey,
        payload: {
          runIds: res.runIds,
          aborted: res.aborted,
          origin: "rpc",
        },
      }).catch(() => {});
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const active = context.chatAbortControllers.get(runId);
    if (!active) {
      respond(true, { ok: true, aborted: false, runIds: [] });
      return;
    }
    if (active.sessionKey !== rawSessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "runId does not match sessionKey"),
      );
      return;
    }

    const partialText = context.chatRunBuffers.get(runId);
    const res = abortChatRunById(ops, {
      runId,
      sessionKey: rawSessionKey,
      stopReason: "rpc",
    });
    if (res.aborted && partialText && partialText.trim()) {
      await persistAbortedPartials({
        context,
        sessionKey: rawSessionKey,
        snapshots: [
          {
            runId,
            sessionId: active.sessionId,
            text: partialText,
            abortOrigin: "rpc",
          },
        ],
      });
    }
    respond(true, {
      ok: true,
      aborted: res.aborted,
      runIds: res.aborted ? [runId] : [],
    });
    await publishChatBusEvent({
      context,
      topic: "chat.aborted",
      sessionKey: rawSessionKey,
      payload: {
        runIds: res.aborted ? [runId] : [],
        aborted: res.aborted,
        origin: "rpc",
      },
    }).catch(() => {});
  },
  "chat.send": async ({ params, respond, context, client }) => {
    if (!validateChatSendParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.send params: ${formatValidationErrors(validateChatSendParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      thinking?: string;
      deliver?: boolean;
      attachments?: Array<{
        type?: string;
        mimeType?: string;
        fileName?: string;
        content?: unknown;
      }>;
      timeoutMs?: number;
      overrides?: ChatRequestOverrides;
      idempotencyKey: string;
    };
    const sanitizedMessageResult = sanitizeChatSendMessageInput(p.message);
    if (!sanitizedMessageResult.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, sanitizedMessageResult.error),
      );
      return;
    }
    const inboundMessage = sanitizedMessageResult.message;
    const stopCommand = isChatStopCommandText(inboundMessage);
    const normalizedAttachments = normalizeRpcAttachmentsToChatAttachments(p.attachments);
    if (
      normalizedAttachments.some((attachment) =>
        typeof attachment.mimeType === "string"
          ? attachment.mimeType.toLowerCase().startsWith("audio/")
          : false,
      )
    ) {
      incrementEnterpriseMetric("chat_audio_requests_total");
    }
    const rawMessage = inboundMessage.trim();
    if (!rawMessage && normalizedAttachments.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "message or attachment required"),
      );
      return;
    }
    let parsedMessage = inboundMessage;
    let parsedImages: ChatImageContent[] = [];
    if (normalizedAttachments.length > 0) {
      try {
        const parsed = await parseMessageWithAttachments(inboundMessage, normalizedAttachments, {
          maxBytes: 5_000_000,
          log: context.logGateway,
        });
        parsedMessage = parsed.message;
        parsedImages = parsed.images;
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
        return;
      }
    }
    const rawSessionKey = p.sessionKey;
    const { cfg, entry, canonicalKey: sessionKey } = loadSessionEntry(rawSessionKey);
    const agentId = resolveSessionAgentId({
      sessionKey,
      config: cfg,
    });
    const statelessScope = resolveChatStatelessScope({ context, sessionKey, cfg });
    const idempotencyScope: IdempotencyScope | null =
      statelessScope && context.idempotencyStore
        ? {
            tenantId: statelessScope.tenantId,
            agentId: statelessScope.agentId,
            operation: "chat.send",
            key: p.idempotencyKey,
          }
        : null;
    const timeoutMs = resolveAgentTimeoutMs({
      cfg,
      overrideMs: p.timeoutMs,
    });
    const requestOverrides = sanitizeChatRequestOverrides(p.overrides);
    const observedModelRoute = resolveObservedModelRoute({
      cfg,
      entry,
      agentId,
      requestOverrides,
    });
    const driverRuntime = resolveDriverRuntime();
    if (!driverRuntime.loadedDrivers.includes(observedModelRoute.driver)) {
      const failedDriver = driverRuntime.failedDrivers.find(
        (candidate) => candidate.driverId === observedModelRoute.driver,
      );
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `model driver "${observedModelRoute.driver}" is not available on this gateway instance`,
          {
            details: {
              modelRoute: observedModelRoute.modelRoute,
              reason: failedDriver?.reason,
              loadedDrivers: driverRuntime.loadedDrivers,
              enabledDrivers: driverRuntime.enabledDrivers,
            },
          },
        ),
      );
      return;
    }
    if (observedModelRoute.driver === "fal") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          'driver "fal" is currently tool-mode only and cannot be used as the primary chat model',
          {
            details: {
              modelRoute: observedModelRoute.modelRoute,
              recommendedUsage: "use as Tool Mode route (media/API tool) instead of chat.send primary model",
            },
          },
        ),
      );
      return;
    }
    if (
      requestOverrides &&
      (requestOverrides.apiKey || requestOverrides.authProfileId) &&
      !hasScope(client?.connect?.scopes, ADMIN_SCOPE)
    ) {
      incrementEnterpriseMetric("chat_tool_authorization_denied_total");
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.FORBIDDEN,
          `chat.send overrides apiKey/authProfileId require scope: ${ADMIN_SCOPE}`,
        ),
      );
      return;
    }
    // Audit accepted BYOK overrides (never log the key itself)
    if (requestOverrides && (requestOverrides.apiKey || requestOverrides.authProfileId)) {
      incrementEnterpriseMetric("byok_override_accepted_total");
      if (context.auditEventStore) {
        context.auditEventStore.append({
          tenantId: context.tenantContext?.tenantId ?? "unknown",
          requesterId: client?.connect?.device?.id,
          action: "byok.override.accepted",
          resource: `${requestOverrides.provider ?? "default"}/${requestOverrides.model ?? "default"}`,
          metadata: {
            provider: requestOverrides.provider,
            model: requestOverrides.model,
            driverId: observedModelRoute.driver,
            modelRoute: observedModelRoute.modelRoute,
            hasApiKey: Boolean(requestOverrides.apiKey),
            hasAuthProfileId: Boolean(requestOverrides.authProfileId),
          },
        }).catch(() => {});
      }
    }

    const now = Date.now();
    const clientRunId = p.idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    if (stopCommand) {
      const res = await abortChatRunsForSessionKeyWithPartials({
        context,
        ops: createChatAbortOps(context),
        sessionKey: rawSessionKey,
        abortOrigin: "stop-command",
        stopReason: "stop",
      });
      await publishChatBusEvent({
        context,
        topic: "chat.aborted",
        sessionKey: rawSessionKey,
        payload: {
          runIds: res.runIds,
          aborted: res.aborted,
          origin: "stop-command",
        },
      }).catch(() => {});
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    if (idempotencyScope && context.idempotencyStore) {
      const ttlMs = resolveChatRunExpiresAtMs({ now: Date.now(), timeoutMs }) - Date.now() + 60_000;
      const reservation = await context.idempotencyStore.reserve(idempotencyScope, Math.max(60_000, ttlMs));
      if (reservation === "exists") {
        const existing = await context.idempotencyStore.get(idempotencyScope);
        if (existing?.status === "completed") {
          const payload =
            (existing.response as Record<string, unknown> | undefined) ?? {
              runId: p.idempotencyKey,
              status: "ok",
            };
          respond(true, payload, undefined, { cached: true, runId: p.idempotencyKey });
          return;
        }
        if (existing?.status === "failed") {
          const err = errorShape(
            ErrorCodes.UNAVAILABLE,
            existing.error?.message
              ? `${existing.error.message} (${existing.error.code})`
              : "previous attempt failed",
          );
          respond(false, existing.response, err, { cached: true, runId: p.idempotencyKey });
          return;
        }
        respond(true, { runId: p.idempotencyKey, status: "in_flight" as const }, undefined, {
          cached: true,
          runId: p.idempotencyKey,
        });
        return;
      }
    }

    const cached = context.dedupe.get(`chat:${clientRunId}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }

    const activeExisting = context.chatAbortControllers.get(clientRunId);
    if (activeExisting) {
      respond(true, { runId: clientRunId, status: "in_flight" as const }, undefined, {
        cached: true,
        runId: clientRunId,
      });
      return;
    }

    try {
      const abortController = new AbortController();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey: rawSessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });
      if (statelessScope && context.sessionStateStore) {
        await context.sessionStateStore.upsert({
          scope: {
            tenantId: statelessScope.tenantId,
            agentId: statelessScope.agentId,
            sessionKey,
          },
          sessionId: entry?.sessionId ?? clientRunId,
          updatedAt: now,
        });
      }
      if (statelessScope && context.memoryStore) {
        await context.memoryStore.append({
          id: randomUUID(),
          scope: statelessScope,
          role: "user",
          content: {
            role: "user",
            content: [{ type: "text", text: parsedMessage }],
            timestamp: now,
            idempotencyKey: clientRunId,
          },
          timestamp: now,
          runId: clientRunId,
          metadata: { idempotencyKey: clientRunId },
        });
      }
      const ackPayload = {
        runId: clientRunId,
        status: "started" as const,
      };
      await publishChatBusEvent({
        context,
        topic: "chat.started",
        sessionKey: rawSessionKey,
        payload: {
          runId: clientRunId,
          modelDriver: observedModelRoute.driver,
          modelProvider: observedModelRoute.provider,
          model: observedModelRoute.model,
          modelRoute: observedModelRoute.modelRoute,
        },
      }).catch(() => {});
      respond(true, ackPayload, undefined, { runId: clientRunId });

      const trimmedMessage = parsedMessage.trim();
      const injectThinking = Boolean(
        p.thinking && trimmedMessage && !trimmedMessage.startsWith("/"),
      );
      const commandBody = injectThinking ? `/think ${p.thinking} ${parsedMessage}` : parsedMessage;
      const clientInfo = client?.connect?.client;
      // Inject timestamp so agents know the current date/time.
      // Only BodyForAgent gets the timestamp — Body stays raw for UI display.
      // See: https://github.com/moltbot/moltbot/issues/3658
      const stampedMessage = injectTimestamp(parsedMessage, timestampOptsFromConfig(cfg));

      const ctx: MsgContext = {
        Body: parsedMessage,
        BodyForAgent: stampedMessage,
        BodyForCommands: commandBody,
        RawBody: parsedMessage,
        CommandBody: commandBody,
        SessionKey: sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
        GatewayClientScopes: client?.connect?.scopes,
      };

      const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
        cfg,
        agentId,
        channel: INTERNAL_MESSAGE_CHANNEL,
      });
      const finalReplyParts: string[] = [];
      const dispatcher = createReplyDispatcher({
        ...prefixOptions,
        onError: (err) => {
          context.logGateway.warn(`webchat dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          if (info.kind !== "final") {
            return;
          }
          const text = payload.text?.trim() ?? "";
          if (!text) {
            return;
          }
          finalReplyParts.push(text);
        },
      });

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          images: parsedImages.length > 0 ? parsedImages : undefined,
          requestOverrides,
          onAgentRunStart: (runId) => {
            agentRunStarted = true;
            const connId = typeof client?.connId === "string" ? client.connId : undefined;
            const wantsToolEvents = hasGatewayClientCap(
              client?.connect?.caps,
              GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
            );
            if (connId && wantsToolEvents) {
              context.registerToolEventRecipient(runId, connId);
              // Register for any other active runs *in the same session* so
              // late-joining clients (e.g. page refresh mid-response) receive
              // in-progress tool events without leaking cross-session data.
              for (const [activeRunId, active] of context.chatAbortControllers) {
                if (activeRunId !== runId && active.sessionKey === p.sessionKey) {
                  context.registerToolEventRecipient(activeRunId, connId);
                }
              }
            }
          },
          onModelSelected,
        },
      })
        .then(async () => {
          if (!agentRunStarted) {
            const combinedReply = finalReplyParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            if (combinedReply && looksLikeDashboardPayload(combinedReply)) {
              incrementEnterpriseMetric("chat_dashboard_responses_total");
            }
            let message: Record<string, unknown> | undefined;
            if (combinedReply) {
              const { storePath: latestStorePath, entry: latestEntry } =
                loadSessionEntry(sessionKey);
              const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
              const appended = await appendAssistantTranscriptMessage({
                context,
                cfg,
                message: combinedReply,
                sessionId,
                sessionKey,
                storePath: latestStorePath,
                sessionFile: latestEntry?.sessionFile,
                agentId,
                createIfMissing: true,
              });
              if (appended.ok) {
                message = appended.message;
              } else {
                context.logGateway.warn(
                  `webchat transcript append failed: ${appended.error ?? "unknown error"}`,
                );
                const now = Date.now();
                message = {
                  role: "assistant",
                  content: [{ type: "text", text: combinedReply }],
                  timestamp: now,
                  // Keep this compatible with Pi stopReason enums even though this message isn't
                  // persisted to the transcript due to the append failure.
                  stopReason: "stop",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                };
              }
            }
            broadcastChatFinal({
              context,
              runId: clientRunId,
              sessionKey: rawSessionKey,
              message,
            });
            await publishChatBusEvent({
              context,
              topic: "chat.final",
              sessionKey: rawSessionKey,
              payload: {
                runId: clientRunId,
                hasMessage: Boolean(message),
                modelDriver: observedModelRoute.driver,
                modelProvider: observedModelRoute.provider,
                model: observedModelRoute.model,
                modelRoute: observedModelRoute.modelRoute,
              },
            }).catch(() => {});
          }
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: true,
            payload: { runId: clientRunId, status: "ok" as const },
          });
          if (idempotencyScope && context.idempotencyStore) {
            await context.idempotencyStore.complete(idempotencyScope, {
              runId: clientRunId,
              status: "ok" as const,
            });
          }
        })
        .catch(async (err) => {
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: false,
            payload: {
              runId: clientRunId,
              status: "error" as const,
              summary: String(err),
            },
            error,
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey: rawSessionKey,
            errorMessage: String(err),
          });
          await publishChatBusEvent({
            context,
            topic: "chat.error",
            sessionKey: rawSessionKey,
            payload: {
              runId: clientRunId,
              error: String(err),
              modelDriver: observedModelRoute.driver,
              modelProvider: observedModelRoute.provider,
              model: observedModelRoute.model,
              modelRoute: observedModelRoute.modelRoute,
            },
          }).catch(() => {});
          if (idempotencyScope && context.idempotencyStore) {
            await context.idempotencyStore.fail(idempotencyScope, {
              code: ErrorCodes.UNAVAILABLE,
              message: String(err),
            });
          }
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });
    } catch (err) {
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      const payload = {
        runId: clientRunId,
        status: "error" as const,
        summary: String(err),
      };
      context.dedupe.set(`chat:${clientRunId}`, {
        ts: Date.now(),
        ok: false,
        payload,
        error,
      });
      if (idempotencyScope && context.idempotencyStore) {
        await context.idempotencyStore.fail(idempotencyScope, {
          code: ErrorCodes.UNAVAILABLE,
          message: String(err),
        });
      }
      respond(false, payload, error, {
        runId: clientRunId,
        error: formatForLog(err),
      });
    }
  },
  "chat.inject": async ({ params, respond, context }) => {
    if (!validateChatInjectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.inject params: ${formatValidationErrors(validateChatInjectParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      label?: string;
    };

    // Load session and prefer stateless memory when tenant scope is available.
    const rawSessionKey = p.sessionKey;
    const { cfg, storePath, entry } = loadSessionEntry(rawSessionKey);
    const statelessScope = resolveChatStatelessScope({ context, sessionKey: rawSessionKey, cfg });
    const sessionId = entry?.sessionId ?? rawSessionKey;
    if (!statelessScope && (!entry?.sessionId || !storePath)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const appended = await appendAssistantTranscriptMessage({
      context,
      cfg,
      message: p.message,
      label: p.label,
      sessionId,
      sessionKey: rawSessionKey,
      storePath,
      sessionFile: entry?.sessionFile,
      agentId: resolveSessionAgentId({ sessionKey: rawSessionKey, config: cfg }),
      createIfMissing: false,
    });
    if (!appended.ok || !appended.messageId || !appended.message) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `failed to write transcript: ${appended.error ?? "unknown error"}`,
        ),
      );
      return;
    }

    // Broadcast to webchat for immediate UI update
    const chatPayload = {
      runId: `inject-${appended.messageId}`,
      sessionKey: rawSessionKey,
      seq: 0,
      state: "final" as const,
      message: appended.message,
    };
    context.broadcast("chat", chatPayload);
    context.nodeSendToSession(rawSessionKey, "chat", chatPayload);
    await publishChatBusEvent({
      context,
      topic: "chat.injected",
      sessionKey: rawSessionKey,
      payload: {
        runId: chatPayload.runId,
        messageId: appended.messageId,
      },
    }).catch(() => {});

    respond(true, { ok: true, messageId: appended.messageId });
  },
};
