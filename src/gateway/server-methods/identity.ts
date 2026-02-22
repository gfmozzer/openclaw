import {
  ErrorCodes,
  errorShape,
  validateIdentityPrincipalUpsertParams,
  validateIdentityPrincipalGetParams,
  validateIdentityPrincipalListParams,
  validateIdentityChannelBindParams,
  validateIdentityChannelUnbindParams,
  validateIdentityChannelListParams,
  validateIdentityGrantUpsertParams,
  validateIdentityGrantRevokeParams,
  formatValidationErrors,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const identityHandlers: GatewayRequestHandlers = {
  "identity.principal.upsert": async ({ params, respond, context }) => {
    if (!validateIdentityPrincipalUpsertParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityPrincipalUpsertParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, principalId, role, attributes } = params;
    try {
      const p = await context.enterpriseIdentityStore.upsertPrincipal(
        tenantId,
        principalId,
        role,
        attributes,
      );
      respond(true, { principal: p });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.principal.get": async ({ params, respond, context }) => {
    if (!validateIdentityPrincipalGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityPrincipalGetParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    try {
      const p = await context.enterpriseIdentityStore.getPrincipal(
        params.tenantId,
        params.principalId,
      );
      if (!p) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "principal not found"));
        return;
      }
      respond(true, { principal: p });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.principal.list": async ({ params, respond, context }) => {
    if (!validateIdentityPrincipalListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityPrincipalListParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, limit = 100, cursor } = params;
    try {
      const result = await context.enterpriseIdentityStore.listPrincipals(tenantId, limit, cursor);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.channel.bind": async ({ params, respond, context }) => {
    if (!validateIdentityChannelBindParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityChannelBindParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, principalId, channel, accountId, subjectId } = params;
    const finalSubjectId = subjectId ?? accountId;
    try {
      const current = await context.enterpriseIdentityStore.getPrincipalByChannel(
        tenantId,
        channel,
        accountId,
        finalSubjectId,
      );
      if (current && (current.tenantId !== tenantId || current.principalId !== principalId)) {
        await context.enterpriseIdentityStore.unbindChannel(
          tenantId,
          channel,
          accountId,
          finalSubjectId,
        );
      }
      const p = await context.enterpriseIdentityStore.bindChannel(
        tenantId,
        principalId,
        channel,
        accountId,
        finalSubjectId,
      );
      respond(true, { binding: p });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.channel.unbind": async ({ params, respond, context }) => {
    if (!validateIdentityChannelUnbindParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityChannelUnbindParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, channel, accountId, subjectId } = params;
    const finalSubjectId = subjectId ?? accountId;
    try {
      await context.enterpriseIdentityStore.unbindChannel(
        tenantId,
        channel,
        accountId,
        finalSubjectId,
      );
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.channel.list": async ({ params, respond, context }) => {
    if (!validateIdentityChannelListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityChannelListParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId } = params;
    try {
      const items = await context.enterpriseIdentityStore.listChannelBindings(tenantId);
      respond(true, { items });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.grant.upsert": async ({ params, respond, context }) => {
    if (!validateIdentityGrantUpsertParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityGrantUpsertParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, principalId, resource, scope } = params;
    try {
      const g = await context.enterpriseIdentityStore.upsertGrant(
        tenantId,
        principalId,
        resource,
        scope, // Using scope as action mapped to the DB
      );
      respond(true, { grant: g });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "identity.grant.revoke": async ({ params, respond, context }) => {
    if (!validateIdentityGrantRevokeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid params: ${formatValidationErrors(validateIdentityGrantRevokeParams.errors)}`,
        ),
      );
      return;
    }
    if (!context.enterpriseIdentityStore) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Store unavailable"));
      return;
    }
    const { tenantId, principalId, resource, scope } = params;
    try {
      await context.enterpriseIdentityStore.revokeGrant(tenantId, principalId, resource, scope);
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
