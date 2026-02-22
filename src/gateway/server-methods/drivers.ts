import {
  DEFAULT_DRIVER_ID,
  modelRouteKey,
  parseModelRouteRef,
} from "../../agents/model-route.js";
import { resolveDriverRuntime } from "../../agents/driver-runtime.js";
import type { ModelCatalogEntry } from "../../agents/model-catalog.js";
import { consumeControlPlaneWriteBudget } from "../control-plane-rate-limit.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateDriversCredentialsDeleteParams,
  validateDriversCredentialsListParams,
  validateDriversCredentialsTestParams,
  validateDriversCredentialsUpsertParams,
  validateDriversRegistryListParams,
  validateDriversModelsListParams,
  validateDriversProvidersListParams,
  validateDriversSmokeTestParams,
} from "../protocol/index.js";
import {
  buildProviderModelGroups,
  buildProviderRegistryList,
  deleteProviderCredential,
  listProviderCredentials,
  upsertProviderCredential,
} from "../providers-service.js";
import { providersHandlers } from "./providers.js";
import type { GatewayRequestHandlers } from "./types.js";
import { isProvidersRpcEnabled } from "../providers-feature-flag.js";
import { incrementEnterpriseMetric } from "../runtime-metrics.js";

function providersRpcDisabledError() {
  return errorShape(
    ErrorCodes.UNAVAILABLE,
    "providers rpc disabled (set OPENCLAW_PROVIDERS_RPC_ENABLED=1 to enable)",
  );
}

function normalizeOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveDriverOrProviderFallback(params: {
  driverId?: string;
  providerId?: string;
}): { driverId?: string; providerId?: string } {
  const driverId = normalizeOptionalId(params.driverId)?.toLowerCase();
  const providerId = normalizeOptionalId(params.providerId);
  return {
    driverId,
    // Special case: driver-level credential provider fallback (ex.: fal)
    providerId: providerId ?? driverId,
  };
}

function findRuntimeDriver(driverId: string | undefined) {
  if (!driverId) return undefined;
  const runtime = resolveDriverRuntime();
  return runtime.drivers.find((entry) => entry.driverId === driverId);
}

function resolveCatalogEntryDriverId(entry: ModelCatalogEntry): string {
  const fromField = typeof entry.driverId === "string" ? entry.driverId.trim().toLowerCase() : "";
  if (fromField) {
    return fromField;
  }
  const parsed = parseModelRouteRef({
    raw: entry.modelRoute ?? entry.id,
    defaultProvider: entry.provider,
    defaultDriver: DEFAULT_DRIVER_ID,
  });
  return parsed?.driver ?? DEFAULT_DRIVER_ID;
}

function filterCatalogByLoadedDrivers(catalog: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const runtime = resolveDriverRuntime();
  const loaded = new Set(runtime.loadedDrivers);
  return catalog.filter((entry) => loaded.has(resolveCatalogEntryDriverId(entry)));
}

function buildDriversProvidersMatrix(catalog: ModelCatalogEntry[], filterDriverId?: string) {
  const runtime = resolveDriverRuntime();
  const registry = buildProviderRegistryList(catalog);
  const registryMap = new Map(registry.map((entry) => [entry.id, entry]));
  const groups = buildProviderModelGroups(catalog).groups;

  const modelsByDriverProvider = new Map<string, number>();
  for (const entry of catalog) {
    const driverId = resolveCatalogEntryDriverId(entry);
    if (filterDriverId && driverId !== filterDriverId) {
      continue;
    }
    const key = `${driverId}::${entry.provider}`;
    modelsByDriverProvider.set(key, (modelsByDriverProvider.get(key) ?? 0) + 1);
  }

  const drivers = runtime.drivers
    .filter((driver) => !filterDriverId || driver.driverId === filterDriverId)
    .map((driver) => {
      const providers = Array.from(modelsByDriverProvider.entries())
        .filter(([key]) => key.startsWith(`${driver.driverId}::`))
        .map(([key, modelCount]) => {
          const providerId = key.slice(`${driver.driverId}::`.length);
          const meta = registryMap.get(providerId);
          return {
            providerId,
            label: meta?.label ?? providerId,
            hasCredential: Boolean(meta?.hasCredential),
            ...(meta?.credentialType ? { credentialType: meta.credentialType } : {}),
            modelCount,
          };
        })
        .sort((a, b) => a.providerId.localeCompare(b.providerId));

      return {
        driverId: driver.driverId,
        enabled: driver.enabled,
        loaded: driver.loaded,
        source: driver.source,
        providers,
        ...(driver.reason ? { reason: driver.reason } : {}),
      };
    })
    .sort((a, b) => a.driverId.localeCompare(b.driverId));

  return { drivers, cachedAt: Date.now(), _groups: groups.length };
}

export const driversHandlers: GatewayRequestHandlers = {
  // Transitional aliases kept for compatibility while frontend migrates.
  "drivers.credentials.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversCredentialsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.credentials.list params: ${formatValidationErrors(validateDriversCredentialsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const resolved = resolveDriverOrProviderFallback(params as { driverId?: string; providerId?: string });
      if (resolved.driverId) {
        const driver = findRuntimeDriver(resolved.driverId);
        if (!driver) {
          respond(true, { credentials: [] }, undefined);
          return;
        }
      }
      const credentials = listProviderCredentials(resolved.providerId);
      respond(true, { credentials }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "drivers.credentials.upsert": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversCredentialsUpsertParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.credentials.upsert params: ${formatValidationErrors(validateDriversCredentialsUpsertParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const resolved = resolveDriverOrProviderFallback(params as { driverId?: string; providerId?: string });
      if (!resolved.providerId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "providerId or driverId is required"));
        return;
      }
      if (resolved.driverId) {
        const driver = findRuntimeDriver(resolved.driverId);
        if (!driver?.enabled) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, `driver disabled or unknown: ${resolved.driverId}`),
          );
          return;
        }
      }
      const {
        credentialType,
        key,
        token,
        email,
      } = params as {
        credentialType: "api_key" | "token" | "oauth";
        key?: string;
        token?: string;
        email?: string;
      };
      const result = await upsertProviderCredential({
        providerId: resolved.providerId,
        credentialType,
        key,
        token,
        email,
      });
      incrementEnterpriseMetric("provider_credential_upsert_total");
      context.auditEventStore
        ?.append({
          tenantId: context.tenantContext?.tenantId ?? "global",
          requesterId: client?.connId,
          action: "drivers.credentials.upsert",
          resource: resolved.driverId
            ? `${resolved.driverId}::${resolved.providerId}`
            : resolved.providerId,
          metadata: {
            driverId: resolved.driverId,
            providerId: resolved.providerId,
            credentialType,
            hasKey: Boolean(key),
            hasToken: Boolean(token),
            hasEmail: Boolean(email),
          },
        })
        .catch(() => {});
      respond(
        true,
        {
          ok: true as const,
          profileId: result.profileId,
          ...(resolved.driverId ? { driverId: resolved.driverId } : {}),
          providerId: result.providerId,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "drivers.credentials.delete": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversCredentialsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.credentials.delete params: ${formatValidationErrors(validateDriversCredentialsDeleteParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { profileId, driverId } = params as { profileId: string; driverId?: string };
      await deleteProviderCredential(profileId);
      context.auditEventStore
        ?.append({
          tenantId: context.tenantContext?.tenantId ?? "global",
          requesterId: client?.connId,
          action: "drivers.credentials.delete",
          resource: profileId,
          metadata: { driverId },
        })
        .catch(() => {});
      respond(true, { ok: true as const, profileId }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "drivers.credentials.test": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversCredentialsTestParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.credentials.test params: ${formatValidationErrors(validateDriversCredentialsTestParams.errors)}`,
        ),
      );
      return;
    }

    const budget = consumeControlPlaneWriteBudget({ client });
    if (!budget.allowed) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `rate limit exceeded for drivers.credentials.test; retry after ${Math.ceil(budget.retryAfterMs / 1000)}s`,
          {
            retryable: true,
            retryAfterMs: budget.retryAfterMs,
            details: { method: "drivers.credentials.test", limit: "3 per 60s" },
          },
        ),
      );
      return;
    }
    try {
      const resolved = resolveDriverOrProviderFallback(params as { driverId?: string; providerId?: string });
      const profileId = normalizeOptionalId((params as { profileId?: string }).profileId);
      const driver = findRuntimeDriver(resolved.driverId);
      if (resolved.driverId && (!driver || !driver.loaded)) {
        respond(
          true,
          {
            ok: false,
            driverId: resolved.driverId,
            providerId: resolved.providerId,
            profileId,
            errorCode: "DRIVER_NOT_LOADED",
            errorMessage: driver?.reason ?? "driver not loaded in this instance",
          },
          undefined,
        );
        return;
      }
      const creds = listProviderCredentials(resolved.providerId);
      const meta =
        (profileId ? creds.find((c) => c.profileId === profileId) : undefined) ??
        creds.find((c) => c.hasCredential);
      const effectiveProviderId = meta?.providerId ?? resolved.providerId;
      const startMs = Date.now();
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const providerModels = effectiveProviderId
        ? catalog.filter((m) => {
            if (m.provider !== effectiveProviderId) return false;
            if (!resolved.driverId) return true;
            return resolveCatalogEntryDriverId(m) === resolved.driverId;
          })
        : [];
      const latencyMs = Date.now() - startMs;
      const ok = Boolean(meta?.hasCredential) && providerModels.length > 0;
      incrementEnterpriseMetric("provider_credential_test_total");
      context.auditEventStore
        ?.append({
          tenantId: context.tenantContext?.tenantId ?? "global",
          requesterId: client?.connId,
          action: "drivers.credentials.test",
          resource: resolved.driverId
            ? `${resolved.driverId}::${effectiveProviderId ?? "unknown"}`
            : (effectiveProviderId ?? "unknown"),
          metadata: {
            driverId: resolved.driverId,
            providerId: effectiveProviderId,
            profileId: meta?.profileId ?? profileId,
            ok,
            modelCount: providerModels.length,
            latencyMs,
          },
        })
        .catch(() => {});
      respond(
        true,
        {
          ok,
          ...(resolved.driverId ? { driverId: resolved.driverId } : {}),
          ...(effectiveProviderId ? { providerId: effectiveProviderId } : {}),
          ...(meta?.profileId ? { profileId: meta.profileId } : profileId ? { profileId } : {}),
          latencyMs,
          ...(ok
            ? {}
            : {
                errorCode: !meta ? "PROFILE_NOT_FOUND" : "NO_MODELS",
                errorMessage: !meta
                  ? "credential profile not found"
                  : "no models found for provider in selected driver/runtime",
              }),
          details: {
            ...(resolved.driverId ? { driverId: resolved.driverId } : {}),
            modelCount: providerModels.length,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "drivers.registry.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversRegistryListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.registry.list params: ${formatValidationErrors(validateDriversRegistryListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const runtime = resolveDriverRuntime();
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const providerMatrix = buildDriversProvidersMatrix(catalog);
      const providerCountByDriver = new Map(
        providerMatrix.drivers.map((entry) => [entry.driverId, entry.providers.length]),
      );
      const modelCountByDriver = new Map<string, number>();
      for (const entry of catalog) {
        const driverId = resolveCatalogEntryDriverId(entry);
        modelCountByDriver.set(driverId, (modelCountByDriver.get(driverId) ?? 0) + 1);
      }
      const drivers = runtime.drivers
        .map((driver) => ({
          driverId: driver.driverId,
          enabled: driver.enabled,
          loaded: driver.loaded,
          source: driver.source,
          providerCount: providerCountByDriver.get(driver.driverId) ?? 0,
          modelCount: modelCountByDriver.get(driver.driverId) ?? 0,
          ...(driver.reason ? { reason: driver.reason } : {}),
        }))
        .sort((a, b) => a.driverId.localeCompare(b.driverId));
      respond(
        true,
        { defaultDriver: runtime.defaultDriver, drivers, cachedAt: Date.now() },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
  "drivers.models.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.models.list params: ${formatValidationErrors(validateDriversModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { driverId, providerId } = params as { driverId?: string; providerId?: string };
      const runtime = resolveDriverRuntime();
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const { groups, cachedAt } = buildProviderModelGroups(catalog, providerId);
      const groupsByProvider = new Map(groups.map((g) => [g.providerId, g]));

      const drivers = runtime.drivers
        .filter((d) => !driverId || d.driverId === driverId)
        .map((driver) => {
          const providerBuckets = new Map<string, ModelCatalogEntry[]>();
          for (const entry of catalog) {
            const entryDriverId = resolveCatalogEntryDriverId(entry);
            if (entryDriverId !== driver.driverId) continue;
            if (providerId && entry.provider !== providerId) continue;
            const list = providerBuckets.get(entry.provider) ?? [];
            list.push(entry);
            providerBuckets.set(entry.provider, list);
          }

          const providers = Array.from(providerBuckets.keys())
            .sort((a, b) => a.localeCompare(b))
            .map((pid) => {
              const base = groupsByProvider.get(pid);
              const models = (base?.models ?? []).filter((m) => (m.driverId ?? DEFAULT_DRIVER_ID) === driver.driverId);
              return {
                providerId: pid,
                models,
                available: Boolean(base?.available ?? true),
              };
            });

          return {
            driverId: driver.driverId,
            enabled: driver.enabled,
            loaded: driver.loaded,
            source: driver.source,
            providers,
            ...(driver.reason ? { reason: driver.reason } : {}),
          };
        })
        .sort((a, b) => a.driverId.localeCompare(b.driverId));

      respond(true, { drivers, cachedAt }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "drivers.providers.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversProvidersListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.providers.list params: ${formatValidationErrors(validateDriversProvidersListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { driverId } = params as { driverId?: string };
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const result = buildDriversProvidersMatrix(catalog, driverId);
      respond(true, { drivers: result.drivers, cachedAt: result.cachedAt }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "drivers.smoke.test": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateDriversSmokeTestParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid drivers.smoke.test params: ${formatValidationErrors(validateDriversSmokeTestParams.errors)}`,
        ),
      );
      return;
    }

    const budget = consumeControlPlaneWriteBudget({ client });
    if (!budget.allowed) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `rate limit exceeded for drivers.smoke.test; retry after ${Math.ceil(budget.retryAfterMs / 1000)}s`,
          {
            retryable: true,
            retryAfterMs: budget.retryAfterMs,
            details: { method: "drivers.smoke.test", limit: "3 per 60s" },
          },
        ),
      );
      return;
    }

    try {
      const {
        level,
        driverId,
        providerId,
        profileId,
        modelId,
        modelRoute,
      } = params as {
        level: "driver" | "credential" | "route";
        driverId?: string;
        providerId?: string;
        profileId?: string;
        modelId?: string;
        modelRoute?: string;
      };
      const startMs = Date.now();
      const runtime = resolveDriverRuntime();
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const latencyMs = Date.now() - startMs;

      if (level === "driver") {
        const resolvedDriverId = (driverId ?? "").trim().toLowerCase();
        if (!resolvedDriverId) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "driverId is required for level=driver"),
          );
          return;
        }
        const detail = runtime.drivers.find((entry) => entry.driverId === resolvedDriverId);
        if (!detail) {
          respond(
            true,
            {
              ok: false,
              level,
              driverId: resolvedDriverId,
              latencyMs,
              errorCode: "DRIVER_NOT_FOUND",
              errorMessage: "driver not found in runtime registry",
            },
            undefined,
          );
          return;
        }
        respond(
          true,
          {
            ok: detail.enabled && detail.loaded,
            level,
            driverId: detail.driverId,
            latencyMs,
            ...(detail.enabled && detail.loaded
              ? {}
              : {
                  errorCode: detail.enabled ? "DRIVER_NOT_LOADED" : "DRIVER_DISABLED",
                  errorMessage: detail.reason ?? "driver is not available in this instance",
                }),
            details: {
              enabled: detail.enabled,
              loaded: detail.loaded,
              source: detail.source,
            },
          },
          undefined,
        );
        return;
      }

      if (level === "credential") {
        const resolvedProviderId = (providerId ?? "").trim();
        if (!resolvedProviderId && !(profileId ?? "").trim()) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              "providerId or profileId is required for level=credential",
            ),
          );
          return;
        }
        const creds = listProviderCredentials();
        const meta =
          creds.find((c) => c.profileId === profileId) ??
          (resolvedProviderId
            ? creds.find((c) => c.providerId === resolvedProviderId && c.hasCredential)
            : undefined);
        const effectiveProviderId = meta?.providerId ?? resolvedProviderId;
        const providerModels = catalog.filter((m) => m.provider === effectiveProviderId);
        const ok = Boolean(meta?.hasCredential) && providerModels.length > 0;
        incrementEnterpriseMetric("provider_credential_test_total");
        respond(
          true,
          {
            ok,
            level,
            providerId: effectiveProviderId || undefined,
            profileId: meta?.profileId,
            latencyMs,
            ...(ok
              ? {}
              : {
                  errorCode: !meta ? "PROFILE_NOT_FOUND" : "NO_MODELS",
                  errorMessage: !meta
                    ? "credential profile not found"
                    : "no models found for provider in loaded drivers",
                }),
            details: { modelCount: providerModels.length },
          },
          undefined,
        );
        return;
      }

      // level=route (transitional route smoke: availability + credential presence)
      const parsedRoute = parseModelRouteRef({
        raw: (modelRoute ?? "").trim() || (modelId ?? "").trim(),
        defaultProvider: providerId ?? "",
        defaultDriver: driverId ?? DEFAULT_DRIVER_ID,
      });
      if (!parsedRoute) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "modelRoute or modelId is required for level=route",
          ),
        );
        return;
      }
      const effectiveRoute = modelRouteKey(parsedRoute);
      const routeExists = catalog.some((entry) => {
        const parsed = parseModelRouteRef({
          raw: entry.modelRoute ?? entry.id,
          defaultProvider: entry.provider,
          defaultDriver: DEFAULT_DRIVER_ID,
        });
        if (!parsed) return false;
        return (
          parsed.driver === parsedRoute.driver &&
          parsed.provider === parsedRoute.provider &&
          parsed.model === parsedRoute.model
        );
      });
      const driverStatus = runtime.drivers.find((d) => d.driverId === parsedRoute.driver);
      const credMeta = listProviderCredentials().find(
        (c) => c.providerId === parsedRoute.provider && c.hasCredential,
      );
      const ok = Boolean(routeExists && driverStatus?.loaded && credMeta);
      respond(
        true,
        {
          ok,
          level,
          driverId: parsedRoute.driver,
          providerId: parsedRoute.provider,
          profileId: credMeta?.profileId,
          modelId: parsedRoute.model,
          modelRoute: effectiveRoute,
          latencyMs,
          ...(ok
            ? {}
            : {
                errorCode: !driverStatus?.loaded
                  ? "DRIVER_NOT_LOADED"
                  : !routeExists
                    ? "ROUTE_NOT_FOUND"
                    : "CREDENTIAL_MISSING",
                errorMessage: !driverStatus?.loaded
                  ? "driver not loaded in this instance"
                  : !routeExists
                    ? "route not found in loaded model catalog"
                    : "no credential found for provider",
              }),
          details: {
            routeSmokeMode: "catalog-availability",
            driverEnabled: Boolean(driverStatus?.enabled),
            driverLoaded: Boolean(driverStatus?.loaded),
            routeExists,
          },
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
