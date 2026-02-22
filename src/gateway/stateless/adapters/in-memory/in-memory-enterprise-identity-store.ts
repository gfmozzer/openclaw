import type {
  ChannelIdentityBindingDef,
  EnterpriseGrantDef,
  EnterpriseIdentityStore,
  EnterprisePrincipalDef,
} from "../../contracts/enterprise-identity-store.js";

export class InMemoryEnterpriseIdentityStore implements EnterpriseIdentityStore {
  private principals = new Map<string, EnterprisePrincipalDef>();
  private bindings = new Map<string, ChannelIdentityBindingDef>();
  private grants = new Map<string, EnterpriseGrantDef>();

  private pKey(t: string, p: string) { return `${t}:${p}`; }
  private bKey(t: string, c: string, a: string, s: string) { return `${t}:${c}:${a}:${s}`; }
  private gKey(t: string, p: string, r: string, a: string) { return `${t}:${p}:${r}:${a}`; }

  async upsertPrincipal(tenantId: string, principalId: string, role: string, attributes?: Record<string, unknown>): Promise<EnterprisePrincipalDef> {
    const key = this.pKey(tenantId, principalId);
    const existing = this.principals.get(key);
    const now = new Date().toISOString();
    const p: EnterprisePrincipalDef = existing ? {
      ...existing,
      role,
      attributes,
      updatedAt: now,
    } : {
      id: crypto.randomUUID(),
      tenantId,
      principalId,
      role,
      status: "active",
      attributes,
      createdAt: now,
      updatedAt: now,
    };
    this.principals.set(key, p);
    return p;
  }

  async getPrincipal(tenantId: string, principalId: string): Promise<EnterprisePrincipalDef | null> {
    return this.principals.get(this.pKey(tenantId, principalId)) ?? null;
  }

  async listPrincipals(tenantId: string, limit = 100, cursor?: string): Promise<{ items: EnterprisePrincipalDef[]; nextCursor?: string }> {
    const items = Array.from(this.principals.values()).filter(p => p.tenantId === tenantId);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: items.slice(0, limit) };
  }

  async bindChannel(tenantId: string, principalId: string, channelId: string, accountId: string, subjectId: string): Promise<ChannelIdentityBindingDef> {
    const key = this.bKey(tenantId, channelId, accountId, subjectId);
    const now = new Date().toISOString();
    const b: ChannelIdentityBindingDef = {
      id: crypto.randomUUID(),
      tenantId,
      channelId,
      accountId,
      subjectId,
      principalId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.bindings.set(key, b);
    return b;
  }

  async unbindChannel(tenantId: string, channelId: string, accountId: string, subjectId: string): Promise<boolean> {
    const key = this.bKey(tenantId, channelId, accountId, subjectId);
    return this.bindings.delete(key);
  }

  async getPrincipalByChannel(tenantId: string, channelId: string, accountId: string, subjectId: string): Promise<EnterprisePrincipalDef | null> {
    const key = this.bKey(tenantId, channelId, accountId, subjectId);
    const binding = this.bindings.get(key);
    if (!binding || binding.status !== "active") return null;
    const p = this.principals.get(this.pKey(tenantId, binding.principalId));
    if (!p || p.status !== "active") return null;
    return p;
  }

  async listChannelBindings(tenantId: string, principalId?: string): Promise<ChannelIdentityBindingDef[]> {
    return Array.from(this.bindings.values()).filter(b => b.tenantId === tenantId && (!principalId || b.principalId === principalId));
  }

  async upsertGrant(tenantId: string, principalId: string, resource: string, action: string, attributes?: Record<string, unknown>): Promise<EnterpriseGrantDef> {
    const key = this.gKey(tenantId, principalId, resource, action);
    const now = new Date().toISOString();
    const g: EnterpriseGrantDef = {
      id: crypto.randomUUID(),
      tenantId,
      principalId,
      resource,
      action,
      attributes,
      createdAt: now,
    };
    this.grants.set(key, g);
    return g;
  }

  async revokeGrant(tenantId: string, principalId: string, resource: string, action: string): Promise<boolean> {
    const key = this.gKey(tenantId, principalId, resource, action);
    return this.grants.delete(key);
  }

  async listGrants(tenantId: string, principalId: string): Promise<EnterpriseGrantDef[]> {
    return Array.from(this.grants.values()).filter(g => g.tenantId === tenantId && g.principalId === principalId);
  }
}
