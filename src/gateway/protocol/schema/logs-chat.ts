import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const LogsTailParamsSchema = Type.Object(
  {
    cursor: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000 })),
    maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
  },
  { additionalProperties: false },
);

export const LogsTailResultSchema = Type.Object(
  {
    file: NonEmptyString,
    cursor: Type.Integer({ minimum: 0 }),
    size: Type.Integer({ minimum: 0 }),
    lines: Type.Array(Type.String()),
    truncated: Type.Optional(Type.Boolean()),
    reset: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

// WebChat/WebSocket-native chat methods
export const ChatHistoryParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

export const ChatSendParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: Type.String(),
    thinking: Type.Optional(Type.String()),
    deliver: Type.Optional(Type.Boolean()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    overrides: Type.Optional(
      Type.Object(
        {
          provider: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          model: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          systemPrompt: Type.Optional(Type.String({ minLength: 1, maxLength: 12_000 })),
          soul: Type.Optional(Type.String({ minLength: 1, maxLength: 12_000 })),
          apiKey: Type.Optional(Type.String({ minLength: 1, maxLength: 8_192 })),
          authProfileId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          skillAllowlist: Type.Optional(
            Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 128 }),
          ),
          optimizationMode: Type.Optional(
            Type.Union([
              Type.Literal("economy"),
              Type.Literal("balanced"),
              Type.Literal("quality"),
              Type.Literal("custom"),
            ]),
          ),
          contextPolicy: Type.Optional(
            Type.Union([
              Type.Literal("lean"),
              Type.Literal("standard"),
              Type.Literal("full"),
            ]),
          ),
          routingHints: Type.Optional(
            Type.Object(
              {
                preferFast: Type.Optional(Type.Boolean()),
                preferCheap: Type.Optional(Type.Boolean()),
                allowEscalation: Type.Optional(Type.Boolean()),
                escalationThreshold: Type.Optional(Type.Number()),
              },
              { additionalProperties: false },
            ),
          ),
          budgetPolicyRef: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
        },
        { additionalProperties: false },
      ),
    ),
    requestContext: Type.Optional(
      Type.Object(
        {
          requestSource: Type.Optional(
            Type.Union([
              Type.Literal("channel_direct"),
              Type.Literal("trusted_frontdoor_api"),
              Type.Literal("internal_supervisor"),
              Type.Literal("system_job"),
              Type.Literal("operator_ui"),
            ]),
          ),
          trustedFrontdoor: Type.Optional(
            Type.Object(
              {
                frontdoorId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
                claimsRef: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
                claims: Type.Optional(
                  Type.Object(
                    {
                      tenantId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
                      principalId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
                      requestId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
                      issuedAt: Type.Optional(Type.Number()),
                      expiresAt: Type.Optional(Type.Number()),
                      scopes: Type.Optional(
                        Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 256 }),
                      ),
                      allowedOverrideFields: Type.Optional(
                        Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 128 }),
                      ),
                    },
                    { additionalProperties: true },
                  ),
                ),
              },
              { additionalProperties: true },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    idempotencyKey: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChatAbortParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ChatInjectParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: NonEmptyString,
    label: Type.Optional(Type.String({ maxLength: 100 })),
  },
  { additionalProperties: false },
);

export const ChatEventSchema = Type.Object(
  {
    runId: NonEmptyString,
    sessionKey: NonEmptyString,
    seq: Type.Integer({ minimum: 0 }),
    state: Type.Union([
      Type.Literal("delta"),
      Type.Literal("final"),
      Type.Literal("aborted"),
      Type.Literal("error"),
    ]),
    message: Type.Optional(Type.Unknown()),
    errorMessage: Type.Optional(Type.String()),
    usage: Type.Optional(Type.Unknown()),
    stopReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
