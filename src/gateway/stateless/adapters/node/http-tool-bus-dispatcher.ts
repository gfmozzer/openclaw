import type {
  ToolBusDispatchRequest,
  ToolBusDispatchResult,
  ToolBusDispatcher,
} from "../../contracts/tool-bus-dispatcher.js";

type HttpToolBusDispatcherOptions = {
  endpoint: string;
  timeoutMs: number;
  authToken?: string;
  busKind: "webhook" | "n8n";
};

function normalizeEndpoint(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function createHttpToolBusDispatcherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ToolBusDispatcher | null {
  const endpoint = normalizeEndpoint(env.OPENCLAW_SKILL_TOOLBUS_ENDPOINT);
  if (!endpoint) {
    return null;
  }
  const timeoutRaw = Number(env.OPENCLAW_SKILL_TOOLBUS_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 15_000;
  const kindRaw = (env.OPENCLAW_SKILL_TOOLBUS_KIND ?? "webhook").trim().toLowerCase();
  const busKind = kindRaw === "n8n" ? "n8n" : "webhook";
  const authToken = env.OPENCLAW_SKILL_TOOLBUS_AUTH_TOKEN?.trim() || undefined;

  return new HttpToolBusDispatcher({
    endpoint,
    timeoutMs,
    authToken,
    busKind,
  });
}

export class HttpToolBusDispatcher implements ToolBusDispatcher {
  constructor(private readonly options: HttpToolBusDispatcherOptions) {}

  async dispatch(request: ToolBusDispatchRequest): Promise<ToolBusDispatchResult> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.options.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.options.authToken) {
        headers.Authorization = `Bearer ${this.options.authToken}`;
      }
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers,
        signal: abort.signal,
        body: JSON.stringify({
          busKind: this.options.busKind,
          request,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<ToolBusDispatchResult>;
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: "HTTP_ERROR",
            message: `tool bus request failed with status ${response.status}`,
          },
          data: body,
        };
      }
      return {
        ok: body.ok !== false,
        outputText: typeof body.outputText === "string" ? body.outputText : undefined,
        data: body.data,
        error:
          body.error && typeof body.error.message === "string"
            ? {
                code: typeof body.error.code === "string" ? body.error.code : "REMOTE_ERROR",
                message: body.error.message,
              }
            : undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "DISPATCH_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
