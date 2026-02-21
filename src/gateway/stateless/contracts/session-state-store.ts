export type SessionScope = {
  tenantId: string;
  agentId: string;
  sessionKey: string;
};

export type SessionRoute = {
  channel: string;
  to: string;
  accountId?: string;
  threadId?: string;
};

export type SessionState = {
  scope: SessionScope;
  sessionId: string;
  updatedAt: number;
  route?: SessionRoute;
  metadata?: Record<string, unknown>;
};

export type SessionPatch = {
  route?: SessionRoute;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
};

export interface SessionStateStore {
  get(scope: SessionScope): Promise<SessionState | null>;
  upsert(state: SessionState): Promise<void>;
  patch(scope: SessionScope, patch: SessionPatch): Promise<SessionState | null>;
  delete(scope: SessionScope): Promise<boolean>;
  listByTenant(tenantId: string, opts?: { limit?: number; cursor?: string }): Promise<SessionState[]>;
}

