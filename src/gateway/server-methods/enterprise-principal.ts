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

export function resolveEnterpriseIdentityFromClient(params: {
  client: GatewayClient | null;
  connId?: string;
}): EnterpriseIdentity | null {
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
  return {
    tenantId,
    requesterId,
    role,
    scopes,
  };
}
