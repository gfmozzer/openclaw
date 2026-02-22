import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const IdentityPrincipalUpsertParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    principalId: NonEmptyString,
    role: NonEmptyString,
    attributes: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type IdentityPrincipalUpsertParams = typeof IdentityPrincipalUpsertParamsSchema["static"];

export const IdentityPrincipalGetParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    principalId: NonEmptyString,
  },
  { additionalProperties: false },
);
export type IdentityPrincipalGetParams = typeof IdentityPrincipalGetParamsSchema["static"];

export const IdentityPrincipalListParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type IdentityPrincipalListParams = typeof IdentityPrincipalListParamsSchema["static"];

export const IdentityChannelBindParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    principalId: NonEmptyString,
    channel: NonEmptyString,
    accountId: NonEmptyString,
    subjectId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
export type IdentityChannelBindParams = typeof IdentityChannelBindParamsSchema["static"];

export const IdentityChannelUnbindParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    channel: NonEmptyString,
    accountId: NonEmptyString,
    subjectId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
export type IdentityChannelUnbindParams = typeof IdentityChannelUnbindParamsSchema["static"];

export const IdentityChannelListParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type IdentityChannelListParams = typeof IdentityChannelListParamsSchema["static"];

export const IdentityGrantUpsertParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    principalId: NonEmptyString,
    resource: NonEmptyString,
    scope: NonEmptyString,
  },
  { additionalProperties: false },
);
export type IdentityGrantUpsertParams = typeof IdentityGrantUpsertParamsSchema["static"];

export const IdentityGrantRevokeParamsSchema = Type.Object(
  {
    tenantId: NonEmptyString,
    principalId: NonEmptyString,
    resource: NonEmptyString,
    scope: NonEmptyString,
  },
  { additionalProperties: false },
);
export type IdentityGrantRevokeParams = typeof IdentityGrantRevokeParamsSchema["static"];
