import {
  formatControlPlaneActor,
  resolveControlPlaneActor,
} from "../control-plane-audit.js";
import type { ModelCatalogEntry } from "../../agents/model-catalog.js";
import { DEFAULT_DRIVER_ID, parseModelRouteRef } from "../../agents/model-route.js";
import { resolveDriverRuntime } from "../../agents/driver-runtime.js";
import { consumeControlPlaneWriteBudget } from "../control-plane-rate-limit.js";
import { isProvidersRpcEnabled } from "../providers-feature-flag.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateProvidersCredentialsDeleteParams,
  validateProvidersCredentialsListParams,
  validateProvidersCredentialsTestParams,
  validateProvidersCredentialsUpsertParams,
  validateProvidersModelsListParams,
  validateProvidersRegistryListParams,
} from "../protocol/index.js";
import {
  buildProviderModelGroups,
  buildProviderRegistryList,
  deleteProviderCredential,
  invalidateProvidersModelsCache,
  listProviderCredentials,
  upsertProviderCredential,
} from "../providers-service.js";
import { incrementEnterpriseMetric } from "../runtime-metrics.js";
import type { GatewayRequestHandlers } from "./types.js";

function resolveCatalogEntryDriverId(entry: ModelCatalogEntry): string {
  const fromField = typeof entry.driverId === "string" ? entry.driverId.trim().toLowerCase() : "";
  if (fromField) {
    return fromField;
  }
  const fromRoute = typeof entry.modelRoute === "string" ? entry.modelRoute.trim() : "";
  if (fromRoute) {
    const parsed = parseModelRouteRef({
      raw: fromRoute,
      defaultProvider: entry.provider,
      defaultDriver: DEFAULT_DRIVER_ID,
    });
    if (parsed) {
      return parsed.driver;
    }
  }
  const fromId = typeof entry.id === "string" ? entry.id.trim() : "";
  if (fromId) {
    const parsed = parseModelRouteRef({
      raw: fromId,
      defaultProvider: entry.provider,
      defaultDriver: DEFAULT_DRIVER_ID,
    });
    if (parsed) {
      return parsed.driver;
    }
  }
  return DEFAULT_DRIVER_ID;
}

function filterCatalogByLoadedDrivers(catalog: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const runtime = resolveDriverRuntime();
  const loadedDrivers = new Set(runtime.loadedDrivers);
  return catalog.filter((entry) => loadedDrivers.has(resolveCatalogEntryDriverId(entry)));
}

function providersRpcDisabledError() {
  return errorShape(
    ErrorCodes.UNAVAILABLE,
    "providers rpc disabled (set OPENCLAW_PROVIDERS_RPC_ENABLED=1 to enable)",
  );
}

export const providersHandlers: GatewayRequestHandlers = {
  // -------------------------------------------------------------------------
  // providers.registry.list
  // -------------------------------------------------------------------------
  "providers.registry.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersRegistryListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.registry.list params: ${formatValidationErrors(validateProvidersRegistryListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const providers = buildProviderRegistryList(catalog);
      respond(true, { providers }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // -------------------------------------------------------------------------
  // providers.credentials.list
  // -------------------------------------------------------------------------
  "providers.credentials.list": async ({ params, respond }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersCredentialsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.credentials.list params: ${formatValidationErrors(validateProvidersCredentialsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { providerId } = params as { providerId?: string };
      const credentials = listProviderCredentials(providerId);
      respond(true, { credentials }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // -------------------------------------------------------------------------
  // providers.credentials.upsert
  // -------------------------------------------------------------------------
  "providers.credentials.upsert": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersCredentialsUpsertParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.credentials.upsert params: ${formatValidationErrors(validateProvidersCredentialsUpsertParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { providerId, credentialType, key, token, email } = params as {
        providerId: string;
        credentialType: "api_key" | "token" | "oauth";
        key?: string;
        token?: string;
        email?: string;
      };

      const actor = resolveControlPlaneActor(client);
      context.logGateway.info(
        `providers.credentials.upsert providerId=${providerId} credentialType=${credentialType} ${formatControlPlaneActor(actor)}`,
      );

      const result = await upsertProviderCredential({
        providerId,
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
          action: "providers.credentials.upsert",
          resource: providerId,
          metadata: {
            credentialType,
            hasKey: Boolean(key),
            hasToken: Boolean(token),
            hasEmail: Boolean(email),
          },
        })
        .catch(() => {});

      // Invalidate model catalog cache so next models.list reflects new credential.
      invalidateProvidersModelsCache();

      respond(true, { ok: true as const, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // -------------------------------------------------------------------------
  // providers.credentials.delete
  // -------------------------------------------------------------------------
  "providers.credentials.delete": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersCredentialsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.credentials.delete params: ${formatValidationErrors(validateProvidersCredentialsDeleteParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { profileId } = params as { profileId: string };

      const actor = resolveControlPlaneActor(client);
      context.logGateway.info(
        `providers.credentials.delete profileId=${profileId} ${formatControlPlaneActor(actor)}`,
      );

      await deleteProviderCredential(profileId);
      context.auditEventStore
        ?.append({
          tenantId: context.tenantContext?.tenantId ?? "global",
          requesterId: client?.connId,
          action: "providers.credentials.delete",
          resource: profileId,
        })
        .catch(() => {});

      // Invalidate model catalog cache.
      invalidateProvidersModelsCache();

      respond(true, { ok: true as const, profileId }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // -------------------------------------------------------------------------
  // providers.credentials.test
  // -------------------------------------------------------------------------
  "providers.credentials.test": async ({ params, respond, client, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersCredentialsTestParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.credentials.test params: ${formatValidationErrors(validateProvidersCredentialsTestParams.errors)}`,
        ),
      );
      return;
    }

    // Rate limit: reuse control-plane write budget (shared with config.apply etc.).
    const budget = consumeControlPlaneWriteBudget({ client });
    if (!budget.allowed) {
      const actor = resolveControlPlaneActor(client);
      context.logGateway.warn(
        `providers.credentials.test rate-limited ${formatControlPlaneActor(actor)} retryAfterMs=${budget.retryAfterMs} key=${budget.key}`,
      );
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `rate limit exceeded for providers.credentials.test; retry after ${Math.ceil(budget.retryAfterMs / 1000)}s`,
          {
            retryable: true,
            retryAfterMs: budget.retryAfterMs,
            details: { method: "providers.credentials.test", limit: "3 per 60s" },
          },
        ),
      );
      return;
    }

    try {
      const { profileId, timeoutMs } = params as {
        profileId: string;
        timeoutMs?: number;
      };
      const effectiveTimeoutMs = timeoutMs ?? 10_000;

      const actor = resolveControlPlaneActor(client);
      context.logGateway.info(
        `providers.credentials.test profileId=${profileId} timeoutMs=${effectiveTimeoutMs} ${formatControlPlaneActor(actor)}`,
      );

      const allCreds = listProviderCredentials();
      const meta = allCreds.find((c) => c.profileId === profileId);
      if (!meta) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `profile not found: ${profileId}`),
        );
        return;
      }

      const providerId = meta.providerId;

      // Lightweight smoke test: check if the provider has any models in the
      // current catalog (which requires a valid credential to discover).
      const startMs = Date.now();
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const latencyMs = Date.now() - startMs;
      const providerModels = catalog.filter((m) => m.provider === providerId);
      const testOk = providerModels.length > 0 && meta.hasCredential;
      incrementEnterpriseMetric("provider_credential_test_total");
      context.auditEventStore
        ?.append({
          tenantId: context.tenantContext?.tenantId ?? "global",
          requesterId: client?.connId,
          action: "providers.credentials.test",
          resource: providerId,
          metadata: {
            profileId,
            ok: testOk,
            modelCount: providerModels.length,
            latencyMs,
          },
        })
        .catch(() => {});

      context.logGateway.info(
        `providers.credentials.test profileId=${profileId} providerId=${providerId} ok=${testOk} modelCount=${providerModels.length} latencyMs=${latencyMs}`,
      );

      respond(
        true,
        {
          ok: testOk,
          providerId,
          profileId,
          latencyMs,
          errorCode: testOk ? undefined : "NO_MODELS",
          errorMessage: testOk
            ? undefined
            : "no models found for provider — check credential or provider configuration",
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // -------------------------------------------------------------------------
  // providers.models.list
  // -------------------------------------------------------------------------
  "providers.models.list": async ({ params, respond, context }) => {
    if (!isProvidersRpcEnabled()) {
      respond(false, undefined, providersRpcDisabledError());
      return;
    }
    if (!validateProvidersModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid providers.models.list params: ${formatValidationErrors(validateProvidersModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const { providerId } = params as { providerId?: string };
      const catalog = filterCatalogByLoadedDrivers(await context.loadGatewayModelCatalog());
      const { groups, cachedAt } = buildProviderModelGroups(catalog, providerId);
      respond(true, { providers: groups, cachedAt }, undefined);
    } catch (err) {
      incrementEnterpriseMetric("provider_models_discovery_fail_total");
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
