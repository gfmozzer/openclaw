import type { AuditEventStore } from "./contracts/audit-event-store.js";
import type { IdempotencyStore } from "./contracts/idempotency-store.js";
import type { MemoryStore } from "./contracts/memory-store.js";
import type { MessageBus } from "./contracts/message-bus.js";
import type { SchedulerOrchestrator } from "./contracts/scheduler-orchestrator.js";
import type { SessionStateStore } from "./contracts/session-state-store.js";
import type { SkillLoader } from "./contracts/skill-loader.js";
import type { SwarmDirectoryStore } from "./contracts/swarm-directory-store.js";
import type { ToolBusDispatcher } from "./contracts/tool-bus-dispatcher.js";
import {
  InMemoryIdempotencyStore,
  InMemoryMemoryStore,
  InMemoryMessageBus,
  InMemorySchedulerOrchestrator,
  InMemorySessionStateStore,
  InMemorySwarmDirectoryStore,
} from "./adapters/in-memory/index.js";
import {
  createHttpToolBusDispatcherFromEnv,
  NodeWorkspaceSkillLoader,
  RedisIdempotencyStore,
  RedisMessageBus,
  resolveRedisRuntimeConfig,
  resolveTemporalOrchestratorConfig,
  resolveS3StatelessConfig,
  S3MemoryStore,
  S3SessionStateStore,
  TemporalSchedulerOrchestrator,
} from "./adapters/node/index.js";
import { resolveCronOrchestrationMode } from "../cron-orchestration-mode.js";

export type StatelessRuntimeDeps = {
  sessionStateStore: SessionStateStore;
  memoryStore: MemoryStore;
  idempotencyStore: IdempotencyStore;
  messageBus: MessageBus;
  schedulerOrchestrator: SchedulerOrchestrator;
  swarmDirectoryStore: SwarmDirectoryStore;
  skillLoader: SkillLoader;
  toolBusDispatcher?: ToolBusDispatcher;
  auditEventStore?: AuditEventStore;
};

export type StatelessBackendMode = "in-memory" | "s3" | "prisma";

export function resolveStatelessBackendMode(
  env: NodeJS.ProcessEnv = process.env,
): StatelessBackendMode {
  const raw = (env.OPENCLAW_STATELESS_BACKEND ?? "in-memory").trim().toLowerCase();
  if (raw === "in-memory") {
    return "in-memory";
  }
  if (raw === "s3") {
    return "s3";
  }
  if (raw === "prisma") {
    return "prisma";
  }
  return "in-memory";
}

function createSharedDeps() {
  const cronOrchestrationMode = resolveCronOrchestrationMode();
  const temporalConfig = resolveTemporalOrchestratorConfig();
  const schedulerOrchestrator =
    cronOrchestrationMode === "temporal" && temporalConfig
      ? new TemporalSchedulerOrchestrator(temporalConfig)
      : new InMemorySchedulerOrchestrator();
  const redisConfig = resolveRedisRuntimeConfig();
  const idempotencyStore = redisConfig
    ? new RedisIdempotencyStore(redisConfig)
    : new InMemoryIdempotencyStore();
  const messageBus = redisConfig ? new RedisMessageBus(redisConfig) : new InMemoryMessageBus();
  const skillLoader = new NodeWorkspaceSkillLoader();
  const toolBusDispatcher = createHttpToolBusDispatcherFromEnv() ?? undefined;
  return { schedulerOrchestrator, idempotencyStore, messageBus, skillLoader, toolBusDispatcher };
}

export function createStatelessRuntimeDeps(
  mode: StatelessBackendMode = resolveStatelessBackendMode(),
): StatelessRuntimeDeps {
  const shared = createSharedDeps();

  if (mode === "prisma") {
    // Lazy-import to avoid loading Prisma when not needed
    const prismaPromise = import("./adapters/prisma/index.js");
    // We need synchronous construction, so we create a deferred-init wrapper.
    // The adapters themselves are async-safe (all methods return Promises).
    let prismaAdapters: Awaited<typeof prismaPromise> | null = null;
    const init = prismaPromise.then((m) => {
      prismaAdapters = m;
    });

    // Create proxy adapters that wait for the lazy import to resolve
    const lazySwarm: SwarmDirectoryStore = {
      async upsert(team) {
        await init;
        const store = new prismaAdapters!.PrismaSwarmDirectoryStore();
        return store.upsert(team);
      },
      async get(params) {
        await init;
        const store = new prismaAdapters!.PrismaSwarmDirectoryStore();
        return store.get(params);
      },
      async list(params) {
        await init;
        const store = new prismaAdapters!.PrismaSwarmDirectoryStore();
        return store.list(params);
      },
      async delete(params) {
        await init;
        const store = new prismaAdapters!.PrismaSwarmDirectoryStore();
        return store.delete(params);
      },
    };

    const lazySession: SessionStateStore = {
      async get(scope) {
        await init;
        const store = new prismaAdapters!.PrismaSessionStateStore();
        return store.get(scope);
      },
      async upsert(state) {
        await init;
        const store = new prismaAdapters!.PrismaSessionStateStore();
        return store.upsert(state);
      },
      async patch(scope, patch) {
        await init;
        const store = new prismaAdapters!.PrismaSessionStateStore();
        return store.patch(scope, patch);
      },
      async delete(scope) {
        await init;
        const store = new prismaAdapters!.PrismaSessionStateStore();
        return store.delete(scope);
      },
      async listByTenant(tenantId, opts) {
        await init;
        const store = new prismaAdapters!.PrismaSessionStateStore();
        return store.listByTenant(tenantId, opts);
      },
    };

    const lazyMemory: MemoryStore = {
      async append(entry) {
        await init;
        const store = new prismaAdapters!.PrismaMemoryStore();
        return store.append(entry);
      },
      async appendMany(entries) {
        await init;
        const store = new prismaAdapters!.PrismaMemoryStore();
        return store.appendMany(entries);
      },
      async list(scope, query) {
        await init;
        const store = new prismaAdapters!.PrismaMemoryStore();
        return store.list(scope, query);
      },
      async compact(scope, opts) {
        await init;
        const store = new prismaAdapters!.PrismaMemoryStore();
        return store.compact(scope, opts);
      },
      async deleteScope(scope) {
        await init;
        const store = new prismaAdapters!.PrismaMemoryStore();
        return store.deleteScope(scope);
      },
    };

    const lazyAudit: AuditEventStore = {
      async append(event) {
        await init;
        const store = new prismaAdapters!.PrismaAuditEventStore();
        return store.append(event);
      },
      async list(query) {
        await init;
        const store = new prismaAdapters!.PrismaAuditEventStore();
        return store.list(query);
      },
    };

    return {
      sessionStateStore: lazySession,
      memoryStore: lazyMemory,
      idempotencyStore: shared.idempotencyStore,
      messageBus: shared.messageBus,
      schedulerOrchestrator: shared.schedulerOrchestrator,
      swarmDirectoryStore: lazySwarm,
      skillLoader: shared.skillLoader,
      toolBusDispatcher: shared.toolBusDispatcher,
      auditEventStore: lazyAudit,
    };
  }

  if (mode === "s3") {
    const s3Config = resolveS3StatelessConfig();
    if (!s3Config) {
      throw new Error(
        "OPENCLAW_STATELESS_BACKEND=s3 requires OPENCLAW_S3_BUCKET (and related S3/MinIO env vars)",
      );
    }
    return {
      sessionStateStore: new S3SessionStateStore(s3Config),
      memoryStore: new S3MemoryStore(s3Config),
      ...shared,
      swarmDirectoryStore: new InMemorySwarmDirectoryStore(),
    };
  }

  return {
    sessionStateStore: new InMemorySessionStateStore(),
    memoryStore: new InMemoryMemoryStore(),
    ...shared,
    swarmDirectoryStore: new InMemorySwarmDirectoryStore(),
  };
}
