import { type OpenClawConfig, loadConfig } from "../config/config.js";
import { DEFAULT_DRIVER_ID, formatModelRoute } from "./model-route.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import { buildDriverSeedModels } from "./driver-seed-models.js";

export type ModelToolContract = Record<string, unknown>;

export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  driverId?: string;
  modelRoute?: string;
  toolMode?: boolean;
  toolContract?: ModelToolContract;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
};

type DiscoveredModel = {
  id: string;
  name?: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
};

type PiSdkModule = typeof import("./pi-model-discovery.js");

let modelCatalogPromise: Promise<ModelCatalogEntry[]> | null = null;
let hasLoggedModelCatalogError = false;
const defaultImportPiSdk = () => import("./pi-model-discovery.js");
let importPiSdk = defaultImportPiSdk;

const CODEX_PROVIDER = "openai-codex";
const OPENAI_CODEX_GPT53_MODEL_ID = "gpt-5.3-codex";
const OPENAI_CODEX_GPT53_SPARK_MODEL_ID = "gpt-5.3-codex-spark";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveModelToolMetadata(params: {
  cfg: OpenClawConfig;
  provider: string;
  modelId: string;
}): { toolMode?: boolean; toolContract?: ModelToolContract } {
  const providerConfig = params.cfg.models?.providers?.[params.provider];
  const providerModels = Array.isArray(providerConfig?.models) ? providerConfig.models : [];
  if (providerModels.length === 0) {
    return {};
  }
  const normalizedModelId = params.modelId.trim().toLowerCase();
  const legacyRoute = `${params.provider}/${params.modelId}`.toLowerCase();
  const canonicalRoute = formatModelRoute(
    {
      driver: DEFAULT_DRIVER_ID,
      provider: params.provider,
      model: params.modelId,
    },
    { includeNativeDriver: true },
  ).toLowerCase();
  const modelEntry = providerModels.find((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const rawId = "id" in entry ? String((entry as { id?: unknown }).id ?? "").trim().toLowerCase() : "";
    if (!rawId) {
      return false;
    }
    return rawId === normalizedModelId || rawId === legacyRoute || rawId === canonicalRoute;
  });
  if (!modelEntry || typeof modelEntry !== "object") {
    return {};
  }

  const raw = modelEntry as { toolMode?: unknown; toolContract?: unknown };
  const contract = isRecord(raw.toolContract) ? raw.toolContract : undefined;
  const explicitToolMode = typeof raw.toolMode === "boolean" ? raw.toolMode : undefined;
  const toolMode = explicitToolMode ?? (contract ? true : undefined);
  return {
    ...(toolMode !== undefined ? { toolMode } : {}),
    ...(contract ? { toolContract: contract } : {}),
  };
}

function applyOpenAICodexSparkFallback(models: ModelCatalogEntry[]): void {
  const hasSpark = models.some(
    (entry) =>
      entry.provider === CODEX_PROVIDER &&
      entry.id.toLowerCase() === OPENAI_CODEX_GPT53_SPARK_MODEL_ID,
  );
  if (hasSpark) {
    return;
  }

  const baseModel = models.find(
    (entry) =>
      entry.provider === CODEX_PROVIDER && entry.id.toLowerCase() === OPENAI_CODEX_GPT53_MODEL_ID,
  );
  if (!baseModel) {
    return;
  }

  models.push({
    ...baseModel,
    id: OPENAI_CODEX_GPT53_SPARK_MODEL_ID,
    name: OPENAI_CODEX_GPT53_SPARK_MODEL_ID,
  });
}

export function resetModelCatalogCacheForTest() {
  modelCatalogPromise = null;
  hasLoggedModelCatalogError = false;
  importPiSdk = defaultImportPiSdk;
}

// Test-only escape hatch: allow mocking the dynamic import to simulate transient failures.
export function __setModelCatalogImportForTest(loader?: () => Promise<PiSdkModule>) {
  importPiSdk = loader ?? defaultImportPiSdk;
}

function createAuthStorage(AuthStorageLike: unknown, path: string) {
  const withFactory = AuthStorageLike as { create?: (path: string) => unknown };
  if (typeof withFactory.create === "function") {
    return withFactory.create(path);
  }
  return new (AuthStorageLike as { new (path: string): unknown })(path);
}

export async function loadModelCatalog(params?: {
  config?: OpenClawConfig;
  useCache?: boolean;
}): Promise<ModelCatalogEntry[]> {
  if (params?.useCache === false) {
    modelCatalogPromise = null;
  }
  if (modelCatalogPromise) {
    return modelCatalogPromise;
  }

  modelCatalogPromise = (async () => {
    const models: ModelCatalogEntry[] = [];
    const sortModels = (entries: ModelCatalogEntry[]) =>
      entries.sort((a, b) => {
        const p = a.provider.localeCompare(b.provider);
        if (p !== 0) {
          return p;
        }
        return a.name.localeCompare(b.name);
      });
    try {
      const cfg = params?.config ?? loadConfig();
      await ensureOpenClawModelsJson(cfg);
      await (
        await import("./pi-auth-json.js")
      ).ensurePiAuthJsonFromAuthProfiles(resolveOpenClawAgentDir());
      // IMPORTANT: keep the dynamic import *inside* the try/catch.
      // If this fails once (e.g. during a pnpm install that temporarily swaps node_modules),
      // we must not poison the cache with a rejected promise (otherwise all channel handlers
      // will keep failing until restart).
      const piSdk = await importPiSdk();
      const agentDir = resolveOpenClawAgentDir();
      const { join } = await import("node:path");
      const authStorage = createAuthStorage(piSdk.AuthStorage, join(agentDir, "auth.json"));
      const registry = new (piSdk.ModelRegistry as unknown as {
        new (
          authStorage: unknown,
          modelsFile: string,
        ):
          | Array<DiscoveredModel>
          | {
              getAll: () => Array<DiscoveredModel>;
            };
      })(authStorage, join(agentDir, "models.json"));
      const entries = Array.isArray(registry) ? registry : registry.getAll();
      for (const entry of entries) {
        const id = String(entry?.id ?? "").trim();
        if (!id) {
          continue;
        }
        const provider = String(entry?.provider ?? "").trim();
        if (!provider) {
          continue;
        }
        const name = String(entry?.name ?? id).trim() || id;
        const contextWindow =
          typeof entry?.contextWindow === "number" && entry.contextWindow > 0
            ? entry.contextWindow
            : undefined;
        const reasoning = typeof entry?.reasoning === "boolean" ? entry.reasoning : undefined;
        const input = Array.isArray(entry?.input) ? entry.input : undefined;
        const toolMetadata = resolveModelToolMetadata({
          cfg,
          provider,
          modelId: id,
        });
        const catalogEntry: ModelCatalogEntry = {
          id,
          name,
          provider,
          driverId: DEFAULT_DRIVER_ID,
          modelRoute: formatModelRoute(
            { driver: DEFAULT_DRIVER_ID, provider, model: id },
            { includeNativeDriver: true },
          ),
          ...(toolMetadata.toolMode !== undefined ? { toolMode: toolMetadata.toolMode } : {}),
          ...(toolMetadata.toolContract ? { toolContract: toolMetadata.toolContract } : {}),
          ...(contextWindow !== undefined ? { contextWindow } : {}),
          ...(reasoning !== undefined ? { reasoning } : {}),
          ...(input !== undefined ? { input } : {}),
        };
        models.push(catalogEntry);
      }
      for (const seeded of buildDriverSeedModels(process.env)) {
        const exists = models.some(
          (entry) =>
            entry.provider.toLowerCase() === seeded.provider.toLowerCase() &&
            entry.id.toLowerCase() === seeded.id.toLowerCase() &&
            (entry.driverId ?? DEFAULT_DRIVER_ID).toLowerCase() ===
              (seeded.driverId ?? DEFAULT_DRIVER_ID).toLowerCase(),
        );
        if (!exists) {
          models.push(seeded);
        }
      }
      applyOpenAICodexSparkFallback(models);

      if (models.length === 0) {
        // If we found nothing, don't cache this result so we can try again.
        modelCatalogPromise = null;
      }

      return sortModels(models);
    } catch (error) {
      if (!hasLoggedModelCatalogError) {
        hasLoggedModelCatalogError = true;
        console.warn(`[model-catalog] Failed to load model catalog: ${String(error)}`);
      }
      // Don't poison the cache on transient dependency/filesystem issues.
      modelCatalogPromise = null;
      if (models.length > 0) {
        return sortModels(models);
      }
      return [];
    }
  })();

  return modelCatalogPromise;
}

/**
 * Check if a model supports image input based on its catalog entry.
 */
export function modelSupportsVision(entry: ModelCatalogEntry | undefined): boolean {
  return entry?.input?.includes("image") ?? false;
}

/**
 * Find a model in the catalog by provider and model ID.
 */
export function findModelInCatalog(
  catalog: ModelCatalogEntry[],
  provider: string,
  modelId: string,
): ModelCatalogEntry | undefined {
  const normalizedProvider = provider.toLowerCase().trim();
  const normalizedModelId = modelId.toLowerCase().trim();
  return catalog.find(
    (entry) =>
      entry.provider.toLowerCase() === normalizedProvider &&
      entry.id.toLowerCase() === normalizedModelId,
  );
}
