import { normalizeDriverId } from "./model-route.js";
import { pathToFileURL } from "node:url";
import path from "node:path";

const BUILTIN_DRIVER_IDS = ["native", "litellm", "azure", "fal"] as const;

type DriverSource = "builtin" | "external";

export type DriverRuntimeStatus = {
  driverId: string;
  enabled: boolean;
  loaded: boolean;
  source: DriverSource;
  entry?: string;
  package?: string;
  reason?: string;
};

export type DriverRuntimeSummary = {
  defaultDriver: string;
  enabledDrivers: string[];
  loadedDrivers: string[];
  failedDrivers: Array<{ driverId: string; reason: string }>;
  drivers: DriverRuntimeStatus[];
};

function parseBool(value: string | undefined): boolean | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function splitDriverList(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((entry) => normalizeDriverId(entry))
    .filter(Boolean);
}

function envTokenToDriverId(token: string): string {
  return normalizeDriverId(token.toLowerCase().replace(/__/g, "-").replace(/_/g, "-"));
}

type MutableDriverRecord = {
  source: DriverSource;
  entry?: string;
  package?: string;
};

type DriverRuntimeConfig = {
  defaultDriver: string;
  enabled: Set<string>;
  records: Map<string, MutableDriverRecord>;
  fingerprint: string;
};

type ExternalDriverLoadResult = {
  loaded: boolean;
  reason?: string;
};

let externalDriverRuntimeCache:
  | {
      fingerprint: string;
      results: Map<string, ExternalDriverLoadResult>;
    }
  | null = null;

function buildDriverRuntimeConfig(env: NodeJS.ProcessEnv): DriverRuntimeConfig {
  const records = new Map<string, MutableDriverRecord>();
  for (const driverId of BUILTIN_DRIVER_IDS) {
    records.set(driverId, { source: "builtin" });
  }

  const explicitEnabled = splitDriverList(env.OPENCLAW_DRIVERS_ENABLED);
  for (const driverId of explicitEnabled) {
    if (!records.has(driverId)) {
      records.set(driverId, { source: "external" });
    }
  }

  const perDriverEnabled = new Map<string, boolean>();
  for (const [key, rawValue] of Object.entries(env)) {
    const match = /^OPENCLAW_DRIVER_([A-Z0-9_]+)_(ENABLED|ENTRY|PACKAGE)$/.exec(key);
    if (!match) {
      continue;
    }
    const [, token, field] = match;
    const driverId = envTokenToDriverId(token);
    const current = records.get(driverId) ?? { source: "external" as const };
    if (field === "ENABLED") {
      const enabled = parseBool(rawValue);
      if (enabled !== undefined) {
        perDriverEnabled.set(driverId, enabled);
      }
    } else if (field === "ENTRY") {
      const entry = (rawValue ?? "").trim();
      if (entry) {
        current.entry = entry;
      }
    } else if (field === "PACKAGE") {
      const pkg = (rawValue ?? "").trim();
      if (pkg) {
        current.package = pkg;
      }
    }
    records.set(driverId, current);
  }

  for (const [driverId, record] of records) {
    if (BUILTIN_DRIVER_IDS.includes(driverId as (typeof BUILTIN_DRIVER_IDS)[number])) {
      record.source = "builtin";
    } else {
      record.source = "external";
    }
  }

  const configuredDefault = normalizeDriverId(env.OPENCLAW_DRIVER_DEFAULT ?? "native");
  let enabled = new Set<string>(
    explicitEnabled.length > 0 ? explicitEnabled : [configuredDefault || "native"],
  );
  for (const [driverId, driverEnabled] of perDriverEnabled) {
    if (driverEnabled) {
      enabled.add(driverId);
    } else {
      enabled.delete(driverId);
    }
  }

  // Hard gate for external drivers:
  // they are loaded only when OPENCLAW_DRIVER_<ID>_ENABLED is explicitly truthy.
  for (const [driverId, record] of records) {
    if (record.source !== "external") {
      continue;
    }
    if (perDriverEnabled.get(driverId) !== true) {
      enabled.delete(driverId);
    }
  }

  if (enabled.size === 0) {
    enabled = new Set(["native"]);
  }

  let defaultDriver = configuredDefault || "native";
  if (!enabled.has(defaultDriver)) {
    defaultDriver = enabled.has("native") ? "native" : Array.from(enabled).sort()[0] ?? "native";
  }

  const fingerprintParts: string[] = [];
  const relevantKeys = Object.keys(env)
    .filter(
      (key) =>
        key === "OPENCLAW_DRIVERS_ENABLED" ||
        key === "OPENCLAW_DRIVER_DEFAULT" ||
        /^OPENCLAW_DRIVER_[A-Z0-9_]+_(ENABLED|ENTRY|PACKAGE)$/.test(key),
    )
    .sort();
  for (const key of relevantKeys) {
    const value = env[key] ?? "";
    fingerprintParts.push(`${key}=${value}`);
  }

  return {
    defaultDriver,
    enabled,
    records,
    fingerprint: fingerprintParts.join("|"),
  };
}

function resolveExternalDriverStatus(params: {
  driverId: string;
  record: MutableDriverRecord;
  config: DriverRuntimeConfig;
}): ExternalDriverLoadResult {
  if (params.record.source !== "external") {
    return { loaded: true };
  }
  if (!params.config.enabled.has(params.driverId)) {
    return { loaded: false };
  }
  if (
    externalDriverRuntimeCache &&
    externalDriverRuntimeCache.fingerprint === params.config.fingerprint
  ) {
    return (
      externalDriverRuntimeCache.results.get(params.driverId) ?? {
        loaded: false,
        reason: "external driver preload missing for this runtime config",
      }
    );
  }
  return {
    loaded: false,
    reason: "external driver preloader has not run for current env",
  };
}

function normalizeImportTarget(rawSpec: string, cwd: string): string {
  const trimmed = rawSpec.trim();
  if (/^(file:|node:|https?:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.match(/^[A-Za-z]:[\\/]/)) {
    const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    return pathToFileURL(absolute).href;
  }
  return trimmed;
}

export async function preloadExternalDrivers(params?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<void> {
  const env = params?.env ?? process.env;
  const cwd = params?.cwd ?? process.cwd();
  const runtimeConfig = buildDriverRuntimeConfig(env);
  const results = new Map<string, ExternalDriverLoadResult>();

  for (const [driverId, record] of runtimeConfig.records) {
    if (!runtimeConfig.enabled.has(driverId) || record.source !== "external") {
      continue;
    }
    const moduleSpec = record.entry || record.package;
    if (!moduleSpec) {
      results.set(driverId, {
        loaded: false,
        reason: `external driver requires OPENCLAW_DRIVER_${driverId.toUpperCase().replace(/-/g, "_")}_ENTRY or _PACKAGE`,
      });
      continue;
    }
    try {
      const importTarget = normalizeImportTarget(moduleSpec, cwd);
      await import(importTarget);
      results.set(driverId, { loaded: true });
    } catch (err) {
      results.set(driverId, {
        loaded: false,
        reason: `failed to import ${moduleSpec}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  externalDriverRuntimeCache = {
    fingerprint: runtimeConfig.fingerprint,
    results,
  };
}

export function resetDriverRuntimeCacheForTest(): void {
  externalDriverRuntimeCache = null;
}

export function resolveDriverRuntime(params?: { env?: NodeJS.ProcessEnv }): DriverRuntimeSummary {
  const env = params?.env ?? process.env;
  const runtimeConfig = buildDriverRuntimeConfig(env);

  const drivers = Array.from(runtimeConfig.records.entries())
    .map(([driverId, record]) => {
      const isEnabled = runtimeConfig.enabled.has(driverId);
      if (!isEnabled) {
        return {
          driverId,
          enabled: false,
          loaded: false,
          source: record.source,
          ...(record.entry ? { entry: record.entry } : {}),
          ...(record.package ? { package: record.package } : {}),
        } satisfies DriverRuntimeStatus;
      }
      if (record.source === "builtin") {
        return {
          driverId,
          enabled: true,
          loaded: true,
          source: "builtin",
          ...(record.entry ? { entry: record.entry } : {}),
          ...(record.package ? { package: record.package } : {}),
        } satisfies DriverRuntimeStatus;
      }
      const status = resolveExternalDriverStatus({
        driverId,
        record,
        config: runtimeConfig,
      });
      return {
        driverId,
        enabled: true,
        loaded: status.loaded,
        source: "external",
        ...(record.entry ? { entry: record.entry } : {}),
        ...(record.package ? { package: record.package } : {}),
        ...(status.reason ? { reason: status.reason } : {}),
      } satisfies DriverRuntimeStatus;
    })
    .sort((a, b) => a.driverId.localeCompare(b.driverId));

  const loadedDrivers = drivers.filter((driver) => driver.loaded).map((driver) => driver.driverId);
  const enabledDrivers = drivers
    .filter((driver) => driver.enabled)
    .map((driver) => driver.driverId)
    .sort((a, b) => a.localeCompare(b));
  const failedDrivers = drivers
    .filter((driver) => driver.enabled && !driver.loaded)
    .map((driver) => ({
      driverId: driver.driverId,
      reason: ("reason" in driver ? driver.reason : undefined) ?? "driver failed to load",
    }));

  return {
    defaultDriver: runtimeConfig.defaultDriver,
    enabledDrivers,
    loadedDrivers,
    failedDrivers,
    drivers,
  };
}

export const DRIVER_RUNTIME_BUILTINS = [...BUILTIN_DRIVER_IDS];
