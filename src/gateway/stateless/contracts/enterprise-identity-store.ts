export type EnterprisePrincipalDef = {
  id: string;
  tenantId: string;
  principalId: string;
  role: string;
  status: string;
  attributes?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ChannelIdentityBindingDef = {
  id: string;
  tenantId: string;
  channelId: string;
  accountId: string;
  subjectId: string;
  principalId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EnterpriseGrantDef = {
  id: string;
  tenantId: string;
  principalId: string;
  resource: string;
  action: string;
  attributes?: Record<string, unknown>;
  createdAt: string;
};

export interface EnterpriseIdentityStore {
  // Principals
  upsertPrincipal(
    tenantId: string,
    principalId: string,
    role: string,
    attributes?: Record<string, unknown>,
  ): Promise<EnterprisePrincipalDef>;
  
  getPrincipal(tenantId: string, principalId: string): Promise<EnterprisePrincipalDef | null>;
  
  listPrincipals(tenantId: string, limit?: number, cursor?: string): Promise<{ items: EnterprisePrincipalDef[]; nextCursor?: string }>;

  // Channel Bindings
  bindChannel(
    tenantId: string,
    principalId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<ChannelIdentityBindingDef>;

  unbindChannel(
    tenantId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<boolean>;

  getPrincipalByChannel(
    tenantId: string,
    channelId: string,
    accountId: string,
    subjectId: string,
  ): Promise<EnterprisePrincipalDef | null>;

  listChannelBindings(
    tenantId: string,
    principalId?: string,
  ): Promise<ChannelIdentityBindingDef[]>;

  // Grants
  upsertGrant(
    tenantId: string,
    principalId: string,
    resource: string,
    action: string,
    attributes?: Record<string, unknown>,
  ): Promise<EnterpriseGrantDef>;

  revokeGrant(
    tenantId: string,
    principalId: string,
    resource: string,
    action: string,
  ): Promise<boolean>;

  listGrants(
    tenantId: string,
    principalId: string,
  ): Promise<EnterpriseGrantDef[]>;
}
