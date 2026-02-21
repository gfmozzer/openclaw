export type RedisRuntimeConfig = {
  url: string;
  prefix: string;
  tls: boolean;
};

type RedisClientLike = {
  connect: () => Promise<void>;
  quit: () => Promise<void>;
  sendCommand: (args: string[]) => Promise<unknown>;
  duplicate: () => RedisClientLike;
  subscribe: (channel: string, listener: (message: string) => void) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
};

type RedisModuleLike = {
  createClient: (opts: { url: string; socket?: { tls?: boolean } }) => RedisClientLike;
};

function parseRedisTlsFlag(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function resolveRedisRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisRuntimeConfig | null {
  const url = (env.OPENCLAW_REDIS_URL ?? "").trim();
  if (!url) {
    return null;
  }
  const prefix = (env.OPENCLAW_REDIS_PREFIX ?? "openclaw").trim() || "openclaw";
  return {
    url,
    prefix,
    tls: parseRedisTlsFlag(env.OPENCLAW_REDIS_TLS),
  };
}

let redisModulePromise: Promise<RedisModuleLike> | null = null;
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

async function loadRedisModule(): Promise<RedisModuleLike> {
  if (!redisModulePromise) {
    redisModulePromise = dynamicImport("redis")
      .then((mod) => {
        if (!mod || typeof mod !== "object") {
          throw new Error('Invalid "redis" module export');
        }
        const candidate = mod as { createClient?: unknown };
        if (typeof candidate.createClient !== "function") {
          throw new Error('Invalid "redis" module: createClient() not found');
        }
        return mod as RedisModuleLike;
      })
      .catch((err) => {
        redisModulePromise = null;
        throw new Error(
          `Redis runtime requested but "redis" dependency is unavailable: ${String(err)}`,
        );
      });
  }
  return redisModulePromise;
}

export class RedisClientFactory {
  private commandClientPromise: Promise<RedisClientLike> | null = null;

  constructor(private readonly config: RedisRuntimeConfig) {}

  async getCommandClient(): Promise<RedisClientLike> {
    if (!this.commandClientPromise) {
      this.commandClientPromise = this.createConnectedClient();
    }
    return this.commandClientPromise;
  }

  async createSubscriptionClient(): Promise<RedisClientLike> {
    const commandClient = await this.getCommandClient();
    const subscriptionClient = commandClient.duplicate();
    await subscriptionClient.connect();
    return subscriptionClient;
  }

  private async createConnectedClient(): Promise<RedisClientLike> {
    const redis = await loadRedisModule();
    const client = redis.createClient({
      url: this.config.url,
      socket: this.config.tls ? { tls: true } : undefined,
    });
    await client.connect();
    return client;
  }
}
