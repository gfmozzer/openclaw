import type {
  SessionPatch,
  SessionScope,
  SessionState,
  SessionStateStore,
} from "../../contracts/session-state-store.js";

function scopeKey(scope: SessionScope): string {
  return `${scope.tenantId}:${scope.agentId}:${scope.sessionKey}`;
}

export class InMemorySessionStateStore implements SessionStateStore {
  private readonly states = new Map<string, SessionState>();

  async get(scope: SessionScope): Promise<SessionState | null> {
    return this.states.get(scopeKey(scope)) ?? null;
  }

  async upsert(state: SessionState): Promise<void> {
    this.states.set(scopeKey(state.scope), state);
  }

  async patch(scope: SessionScope, patch: SessionPatch): Promise<SessionState | null> {
    const current = this.states.get(scopeKey(scope));
    if (!current) {
      return null;
    }
    const next: SessionState = {
      ...current,
      ...(patch.route ? { route: patch.route } : {}),
      ...(patch.metadata ? { metadata: patch.metadata } : {}),
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    this.states.set(scopeKey(scope), next);
    return next;
  }

  async delete(scope: SessionScope): Promise<boolean> {
    return this.states.delete(scopeKey(scope));
  }

  async listByTenant(
    tenantId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<SessionState[]> {
    const limit = Math.max(1, opts?.limit ?? 100);
    const states = Array.from(this.states.values())
      .filter((state) => state.scope.tenantId === tenantId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!opts?.cursor) {
      return states.slice(0, limit);
    }
    const fromIndex = states.findIndex((entry) => scopeKey(entry.scope) === opts.cursor);
    if (fromIndex < 0) {
      return states.slice(0, limit);
    }
    return states.slice(fromIndex + 1, fromIndex + 1 + limit);
  }
}

