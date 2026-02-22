import type { ModelRef } from "./model-selection.js";
import { parseModelRef } from "./model-selection.js";

export const DEFAULT_DRIVER_ID = "native";

export type ModelRouteRef = {
  driver: string;
  provider: string;
  model: string;
};

export function normalizeDriverId(driver: string): string {
  const normalized = driver.trim().toLowerCase();
  return normalized || DEFAULT_DRIVER_ID;
}

export function toModelRouteRef(params: {
  driver?: string;
  provider: string;
  model: string;
}): ModelRouteRef {
  return {
    driver: normalizeDriverId(params.driver ?? DEFAULT_DRIVER_ID),
    provider: params.provider.trim().toLowerCase(),
    model: params.model.trim(),
  };
}

export function parseModelRouteRef(params: {
  raw: string;
  defaultProvider?: string;
  defaultDriver?: string;
}): ModelRouteRef | null {
  const raw = params.raw.trim();
  if (!raw) {
    return null;
  }

  // Canonical explicit route format for multi-driver runtime:
  //   driver::provider/model
  const explicit = /^([^:\s/]+)::([^/\s]+)\/(.+)$/.exec(raw);
  if (explicit) {
    const [, driverRaw, providerRaw, modelRaw] = explicit;
    const model = modelRaw.trim();
    if (!model) {
      return null;
    }
    return toModelRouteRef({
      driver: driverRaw,
      provider: providerRaw,
      model,
    });
  }

  // Backward-compatible legacy format:
  //   provider/model  OR  model (with defaultProvider)
  if (!params.defaultProvider) {
    return null;
  }
  const parsedLegacy = parseModelRef(raw, params.defaultProvider);
  if (!parsedLegacy) {
    return null;
  }
  return toModelRouteRef({
    driver: params.defaultDriver ?? DEFAULT_DRIVER_ID,
    provider: parsedLegacy.provider,
    model: parsedLegacy.model,
  });
}

export function toLegacyModelRef(route: ModelRouteRef): ModelRef {
  return {
    provider: route.provider,
    model: route.model,
  };
}

export function modelRouteKey(route: ModelRouteRef): string {
  return `${normalizeDriverId(route.driver)}::${route.provider}/${route.model}`;
}

export function formatModelRoute(
  route: ModelRouteRef,
  options?: { includeNativeDriver?: boolean },
): string {
  if (!options?.includeNativeDriver && normalizeDriverId(route.driver) === DEFAULT_DRIVER_ID) {
    return `${route.provider}/${route.model}`;
  }
  return modelRouteKey(route);
}
