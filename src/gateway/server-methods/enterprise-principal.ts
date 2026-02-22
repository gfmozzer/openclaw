import type { ConnectParams } from "../protocol/index.js";
import type { EnterpriseIdentity, EnterpriseRole, EnterpriseScope } from "../stateless/contracts/index.js";
import type { GatewayClient } from "./types.js";

const ENTERPRISE_SCOPE_SET: ReadonlySet<string> = new Set<EnterpriseScope>([
  "jobs:schedule:self",
  "jobs:schedule:team",
  "jobs:cancel:self",
  "jobs:cancel:team",
  "swarm:read",
  "swarm:write",
  "skills:invoke",
  "skills:invoke:finance",
  "memory:read:self",
  "memory:read:team",
]);

function readNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readEnterpriseScopes(scopes: string[] | undefined): EnterpriseScope[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes.filter((scope): scope is EnterpriseScope => ENTERPRISE_SCOPE_SET.has(scope));
}

function resolveEnterpriseRole(params: {
  role: ConnectParams["role"];
  scopes: EnterpriseScope[];
}): EnterpriseRole {
  if (params.scopes.includes("jobs:schedule:team") || params.scopes.includes("jobs:cancel:team")) {
    return "supervisor";
  }
  if (params.role === "node") {
    return "worker";
  }
  return "admin";
}

export async function resolveEnterpriseIdentityFromClient(params: {
  client: GatewayClient | null;
  connId?: string;
  store?: import("../stateless/contracts/enterprise-identity-store.js").EnterpriseIdentityStore;
}): Promise<EnterpriseIdentity | null> {
  const connect = params.client?.connect;
  if (!connect) {
    return null;
  }
  const tenantId = readNonEmpty((connect as ConnectParams & { tenantId?: unknown }).tenantId) ?? "default";
  const requesterId =
    readNonEmpty((connect as ConnectParams & { requesterId?: unknown }).requesterId) ??
    readNonEmpty(connect.device?.id) ??
    readNonEmpty(connect.client.instanceId) ??
    readNonEmpty(params.connId) ??
    "unknown-requester";
  const scopes = readEnterpriseScopes(connect.scopes);
  const role = resolveEnterpriseRole({ role: connect.role, scopes });

  if (params.store) {
    try {
      const stored = await params.store.getPrincipal(tenantId, requesterId);
      if (stored) {
        return {
          tenantId: stored.tenantId,
          requesterId: stored.principalId,
          role: stored.role as EnterpriseRole,
          scopes: (stored.attributes?.scopes as EnterpriseScope[]) ?? scopes,
        };
      }
      // Auto-upsert if not exists, based on token claims
      const upserted = await params.store.upsertPrincipal(tenantId, requesterId, role, { scopes });
      return {
        tenantId: upserted.tenantId,
        requesterId: upserted.principalId,
        role: upserted.role as EnterpriseRole,
        scopes: (upserted.attributes?.scopes as EnterpriseScope[]) ?? scopes,
      };
    } catch (err) {
      // Fallback to connection claims on store error
      console.warn(`[EnterpriseIdentity] store lookup failed for ${tenantId}/${requesterId}:`, err);
    }
  }

  return {
    tenantId,
    requesterId,
    role,
    scopes,
  };
}
