import { Socket } from "node:net";
import { resolveStatelessBackendMode } from "../stateless/runtime.js";
import { resolveRedisRuntimeConfig } from "../stateless/adapters/node/index.js";
import { createS3Client, listKeys, resolveS3StatelessConfig } from "../stateless/adapters/node/s3-shared.js";
import type { GatewayRequestHandlers } from "./types.js";

type ProbeState = "ok" | "error" | "skipped";

type ProbeResult = {
  configured: boolean;
  state: ProbeState;
  detail?: string;
};

async function probeRedis(): Promise<ProbeResult> {
  const config = resolveRedisRuntimeConfig();
  if (!config) {
    return { configured: false, state: "skipped", detail: "OPENCLAW_REDIS_URL not configured" };
  }
  let host = "127.0.0.1";
  let port = 6379;
  try {
    const parsed = new URL(config.url);
    host = parsed.hostname || host;
    port = Number(parsed.port || "6379");
  } catch {
    return { configured: true, state: "error", detail: "OPENCLAW_REDIS_URL malformed" };
  }
  try {
    const redisModule = (await import("redis")) as unknown as {
      createClient: (opts: { url: string; socket?: { tls?: boolean } }) => {
        connect: () => Promise<unknown>;
        sendCommand: (args: string[]) => Promise<unknown>;
        quit: () => Promise<void>;
      };
    };
    const client = redisModule.createClient({
      url: config.url,
      socket: config.tls ? { tls: true } : undefined,
    });
    try {
      await client.connect();
      const pong = await client.sendCommand(["PING"]);
      return {
        configured: true,
        state: String(pong).toUpperCase() === "PONG" ? "ok" : "error",
        detail: `PING=${String(pong)}`,
      };
    } finally {
      await client.quit().catch(() => {});
    }
  } catch {
    // Fall through to a raw TCP PING probe when the redis package is not installed.
  }
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeoutMs = 2_500;
    let done = false;
    const finish = (result: ProbeResult) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });
    socket.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes("+PONG")) {
        finish({ configured: true, state: "ok", detail: "PING=PONG (tcp)" });
      }
    });
    socket.once("timeout", () => {
      finish({
        configured: true,
        state: "error",
        detail: `connection timeout (${timeoutMs}ms)`,
      });
    });
    socket.once("error", (err) => {
      finish({
        configured: true,
        state: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    });
    socket.connect(port, host);
  });
}

async function probeS3(): Promise<ProbeResult> {
  const config = resolveS3StatelessConfig();
  if (!config) {
    return { configured: false, state: "skipped", detail: "OPENCLAW_S3_BUCKET not configured" };
  }
  try {
    const client = createS3Client(config);
    await listKeys({
      client,
      bucket: config.bucket,
      prefix: `${config.rootPrefix}/`,
      maxKeys: 1,
    });
    return {
      configured: true,
      state: "ok",
      detail: `bucket=${config.bucket}`,
    };
  } catch (err) {
    return {
      configured: true,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function probePostgres(): Promise<ProbeResult> {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Promise.resolve({
      configured: false,
      state: "skipped",
      detail: "DATABASE_URL not configured",
    });
  }
  let host = "localhost";
  let port = 5432;
  try {
    const normalized = databaseUrl.replace(/^postgres(ql)?:\/\//i, "http://");
    const parsed = new URL(normalized);
    host = parsed.hostname || host;
    port = Number(parsed.port || "5432");
  } catch {
    return Promise.resolve({
      configured: true,
      state: "error",
      detail: "DATABASE_URL malformed",
    });
  }
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeoutMs = 2_500;
    let done = false;
    const finish = (result: ProbeResult) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish({ configured: true, state: "ok", detail: `${host}:${port}` });
    });
    socket.once("timeout", () => {
      finish({
        configured: true,
        state: "error",
        detail: `connection timeout (${timeoutMs}ms)`,
      });
    });
    socket.once("error", (err) => {
      finish({
        configured: true,
        state: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    });
    socket.connect(port, host);
  });
}

export const chatPortalHandlers: GatewayRequestHandlers = {
  "chat.portal.contract": ({ respond }) => {
    respond(
      true,
      {
        specVersion: "2026-02-21",
        chatFirst: true,
        richBlocks: {
          supportedTypes: ["text", "table", "chart", "dashboard", "actions"],
          envelope: {
            type: "dashboard",
            specVersion: "1.0",
            renderer: "react-json-spec",
            data: {},
            layout: {},
            permissionsHint: {
              tenantId: "tenant-a",
              requiredScopes: ["reports:read"],
            },
          },
          allowedRenderers: ["react-json-spec", "html-sandboxed"],
          htmlPolicy: {
            sandboxed: true,
            allowScripts: false,
          },
        },
        asyncResume: {
          transport: "temporal-callback-and-pull",
          callbackMethod: "cron.callback",
          pullMethod: "cron.resume.pull",
        },
      },
      undefined,
    );
  },
  "chat.portal.stack.status": async ({ respond }) => {
    const [redis, s3, postgres] = await Promise.all([probeRedis(), probeS3(), probePostgres()]);
    respond(
      true,
      {
        statelessBackend: resolveStatelessBackendMode(),
        probes: {
          redis,
          s3,
          postgres,
        },
      },
      undefined,
    );
  },
};
