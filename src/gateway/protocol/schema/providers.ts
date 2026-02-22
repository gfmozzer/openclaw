import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const ProviderSourceSchema = Type.Union([
  Type.Literal("plugin"),
  Type.Literal("builtin"),
  Type.Literal("custom"),
]);

export const ProviderCredentialTypeSchema = Type.Union([
  Type.Literal("api_key"),
  Type.Literal("token"),
  Type.Literal("oauth"),
]);

// ---------------------------------------------------------------------------
// providers.registry.list
// ---------------------------------------------------------------------------

export const ProvidersRegistryEntrySchema = Type.Object(
  {
    id: NonEmptyString,
    label: NonEmptyString,
    sources: Type.Array(ProviderSourceSchema),
    hasCredential: Type.Boolean(),
    credentialType: Type.Optional(ProviderCredentialTypeSchema),
    modelCount: Type.Integer({ minimum: 0 }),
    supportsCredentialTest: Type.Boolean(),
    supportsLiveModelDiscovery: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ProvidersRegistryListParamsSchema = Type.Object({}, { additionalProperties: false });

export const ProvidersRegistryListResultSchema = Type.Object(
  {
    providers: Type.Array(ProvidersRegistryEntrySchema),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.registry.list (driver-centric runtime registry)
// ---------------------------------------------------------------------------

export const DriverRegistryEntrySchema = Type.Object(
  {
    driverId: NonEmptyString,
    enabled: Type.Boolean(),
    loaded: Type.Boolean(),
    source: Type.Union([Type.Literal("builtin"), Type.Literal("external")]),
    providerCount: Type.Integer({ minimum: 0 }),
    modelCount: Type.Integer({ minimum: 0 }),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const DriversRegistryListParamsSchema = Type.Object({}, { additionalProperties: false });

export const DriversRegistryListResultSchema = Type.Object(
  {
    defaultDriver: NonEmptyString,
    drivers: Type.Array(DriverRegistryEntrySchema),
    cachedAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// providers.credentials.list
// ---------------------------------------------------------------------------

export const ProvidersCredentialMetaSchema = Type.Object(
  {
    profileId: NonEmptyString,
    providerId: NonEmptyString,
    credentialType: ProviderCredentialTypeSchema,
    hasCredential: Type.Boolean(),
    lastUpdatedAt: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const ProvidersCredentialsListParamsSchema = Type.Object(
  {
    providerId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ProvidersCredentialsListResultSchema = Type.Object(
  {
    credentials: Type.Array(ProvidersCredentialMetaSchema),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.credentials.list
// ---------------------------------------------------------------------------

export const DriversCredentialsListParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const DriversCredentialsListResultSchema = ProvidersCredentialsListResultSchema;

// ---------------------------------------------------------------------------
// providers.credentials.upsert
// ---------------------------------------------------------------------------

export const ProvidersCredentialsUpsertParamsSchema = Type.Object(
  {
    providerId: NonEmptyString,
    credentialType: ProviderCredentialTypeSchema,
    key: Type.Optional(Type.String()),
    token: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProvidersCredentialsUpsertResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    profileId: NonEmptyString,
    providerId: NonEmptyString,
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.credentials.upsert
// ---------------------------------------------------------------------------

export const DriversCredentialsUpsertParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
    credentialType: ProviderCredentialTypeSchema,
    key: Type.Optional(Type.String()),
    token: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const DriversCredentialsUpsertResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    profileId: NonEmptyString,
    driverId: Type.Optional(NonEmptyString),
    providerId: NonEmptyString,
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// providers.credentials.delete
// ---------------------------------------------------------------------------

export const ProvidersCredentialsDeleteParamsSchema = Type.Object(
  {
    profileId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ProvidersCredentialsDeleteResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    profileId: NonEmptyString,
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.credentials.delete
// ---------------------------------------------------------------------------

export const DriversCredentialsDeleteParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
    profileId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const DriversCredentialsDeleteResultSchema = ProvidersCredentialsDeleteResultSchema;

// ---------------------------------------------------------------------------
// providers.credentials.test
// ---------------------------------------------------------------------------

export const ProvidersCredentialsTestParamsSchema = Type.Object(
  {
    profileId: NonEmptyString,
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 30000 })),
  },
  { additionalProperties: false },
);

export const ProvidersCredentialsTestResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
    providerId: NonEmptyString,
    profileId: NonEmptyString,
    latencyMs: Type.Optional(Type.Integer({ minimum: 0 })),
    errorCode: Type.Optional(Type.String()),
    errorMessage: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.credentials.test
// ---------------------------------------------------------------------------

export const DriversCredentialsTestParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
    profileId: Type.Optional(NonEmptyString),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 30000 })),
  },
  { additionalProperties: false },
);

export const DriversCredentialsTestResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
    profileId: Type.Optional(NonEmptyString),
    latencyMs: Type.Optional(Type.Integer({ minimum: 0 })),
    errorCode: Type.Optional(Type.String()),
    errorMessage: Type.Optional(Type.String()),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// providers.models.list
// ---------------------------------------------------------------------------

export const ProviderModelEntrySchema = Type.Object(
  {
    id: NonEmptyString,
    name: NonEmptyString,
    source: ProviderSourceSchema,
    driverId: Type.Optional(NonEmptyString),
    modelRoute: Type.Optional(NonEmptyString),
    toolMode: Type.Optional(Type.Boolean()),
    toolContract: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    contextWindow: Type.Optional(Type.Integer({ minimum: 1 })),
    reasoning: Type.Optional(Type.Boolean()),
    input: Type.Optional(
      Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")])),
    ),
  },
  { additionalProperties: false },
);

export const ProviderModelGroupSchema = Type.Object(
  {
    providerId: NonEmptyString,
    models: Type.Array(ProviderModelEntrySchema),
    available: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const ProvidersModelsListParamsSchema = Type.Object(
  {
    providerId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ProvidersModelsListResultSchema = Type.Object(
  {
    providers: Type.Array(ProviderModelGroupSchema),
    cachedAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.models.list (driver->provider->models)
// ---------------------------------------------------------------------------

export const DriverProviderModelsGroupSchema = Type.Object(
  {
    providerId: NonEmptyString,
    models: Type.Array(ProviderModelEntrySchema),
    available: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const DriverModelsGroupSchema = Type.Object(
  {
    driverId: NonEmptyString,
    enabled: Type.Boolean(),
    loaded: Type.Boolean(),
    source: Type.Union([Type.Literal("builtin"), Type.Literal("external")]),
    providers: Type.Array(DriverProviderModelsGroupSchema),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const DriversModelsListParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const DriversModelsListResultSchema = Type.Object(
  {
    drivers: Type.Array(DriverModelsGroupSchema),
    cachedAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.providers.list (driver-centric provider matrix)
// ---------------------------------------------------------------------------

export const DriverProviderEntrySchema = Type.Object(
  {
    providerId: NonEmptyString,
    label: NonEmptyString,
    hasCredential: Type.Boolean(),
    credentialType: Type.Optional(ProviderCredentialTypeSchema),
    modelCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const DriversProvidersDriverGroupSchema = Type.Object(
  {
    driverId: NonEmptyString,
    enabled: Type.Boolean(),
    loaded: Type.Boolean(),
    source: Type.Union([Type.Literal("builtin"), Type.Literal("external")]),
    providers: Type.Array(DriverProviderEntrySchema),
    reason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const DriversProvidersListParamsSchema = Type.Object(
  {
    driverId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const DriversProvidersListResultSchema = Type.Object(
  {
    drivers: Type.Array(DriversProvidersDriverGroupSchema),
    cachedAt: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// ---------------------------------------------------------------------------
// drivers.smoke.test (driver / credential / route)
// ---------------------------------------------------------------------------

export const DriversSmokeLevelSchema = Type.Union([
  Type.Literal("driver"),
  Type.Literal("credential"),
  Type.Literal("route"),
]);

export const DriversSmokeTestParamsSchema = Type.Object(
  {
    level: DriversSmokeLevelSchema,
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
    profileId: Type.Optional(NonEmptyString),
    modelId: Type.Optional(NonEmptyString),
    modelRoute: Type.Optional(NonEmptyString),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 30000 })),
  },
  { additionalProperties: false },
);

export const DriversSmokeTestResultSchema = Type.Object(
  {
    ok: Type.Boolean(),
    level: DriversSmokeLevelSchema,
    driverId: Type.Optional(NonEmptyString),
    providerId: Type.Optional(NonEmptyString),
    profileId: Type.Optional(NonEmptyString),
    modelId: Type.Optional(NonEmptyString),
    modelRoute: Type.Optional(NonEmptyString),
    latencyMs: Type.Optional(Type.Integer({ minimum: 0 })),
    errorCode: Type.Optional(Type.String()),
    errorMessage: Type.Optional(Type.String()),
    details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
