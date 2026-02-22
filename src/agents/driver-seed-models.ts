import { formatModelRoute } from "./model-route.js";
import type { ModelCatalogEntry } from "./model-catalog.js";

function truthy(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pushUnique(entries: ModelCatalogEntry[], next: ModelCatalogEntry) {
  const key = `${next.driverId ?? "native"}::${next.provider}/${next.id}`;
  if (
    entries.some(
      (entry) =>
        `${entry.driverId ?? "native"}::${entry.provider}/${entry.id}`.toLowerCase() === key.toLowerCase(),
    )
  ) {
    return;
  }
  entries.push(next);
}

export function buildDriverSeedModels(env: NodeJS.ProcessEnv = process.env): ModelCatalogEntry[] {
  const entries: ModelCatalogEntry[] = [];

  const falEnabled = truthy(env.OPENCLAW_DRIVER_FAL_ENABLED);
  if (falEnabled) {
    const configuredFalModels = splitCsv(env.OPENCLAW_DRIVER_FAL_MODELS);
    const falModels =
      configuredFalModels.length > 0
        ? configuredFalModels
        : ["fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/kling-video/v1/standard/text-to-video"];
    for (const modelId of falModels) {
      pushUnique(entries, {
        id: modelId,
        name: modelId,
        provider: "fal",
        driverId: "fal",
        modelRoute: formatModelRoute(
          { driver: "fal", provider: "fal", model: modelId },
          { includeNativeDriver: true },
        ),
        toolMode: true,
        toolContract: {
          kind: modelId.includes("video") ? "video" : "image",
          description: "Fal.ai generated media endpoint (tool mode)",
          timeoutMs: 120_000,
        },
        input: ["text"],
      });
    }
  }

  const azureEnabled = truthy(env.OPENCLAW_DRIVER_AZURE_ENABLED);
  const azureDeployment = (env.AZURE_OPENAI_DEPLOYMENT ?? "").trim();
  if (azureEnabled && azureDeployment) {
    pushUnique(entries, {
      id: azureDeployment,
      name: azureDeployment,
      provider: "azure-openai",
      driverId: "azure",
      modelRoute: formatModelRoute(
        { driver: "azure", provider: "azure-openai", model: azureDeployment },
        { includeNativeDriver: true },
      ),
      input: ["text"],
      reasoning: true,
    });
  }

  return entries;
}

