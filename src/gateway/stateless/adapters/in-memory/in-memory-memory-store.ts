import type {
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
} from "../../contracts/memory-store.js";

function scopeKey(scope: MemoryScope): string {
  return `${scope.tenantId}:${scope.agentId}:${scope.sessionKey}`;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries = new Map<string, MemoryEntry[]>();

  async append(entry: MemoryEntry): Promise<void> {
    const key = scopeKey(entry.scope);
    const list = this.entries.get(key) ?? [];
    list.push(entry);
    this.entries.set(key, list);
  }

  async appendMany(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.append(entry);
    }
  }

  async list(scope: MemoryScope, query?: MemoryQuery): Promise<MemoryEntry[]> {
    const key = scopeKey(scope);
    const list = this.entries.get(key) ?? [];
    const before = query?.before;
    const after = query?.after;
    const limit = Math.max(1, query?.limit ?? (list.length || 1));
    return list
      .filter((entry) => (before == null ? true : entry.timestamp < before))
      .filter((entry) => (after == null ? true : entry.timestamp > after))
      .slice(-limit);
  }

  async compact(scope: MemoryScope, opts: { keepLast: number }): Promise<number> {
    const key = scopeKey(scope);
    const current = this.entries.get(key) ?? [];
    const keepLast = Math.max(0, opts.keepLast);
    if (current.length <= keepLast) {
      return 0;
    }
    const removed = current.length - keepLast;
    this.entries.set(key, current.slice(-keepLast));
    return removed;
  }

  async deleteScope(scope: MemoryScope): Promise<number> {
    const key = scopeKey(scope);
    const current = this.entries.get(key) ?? [];
    this.entries.delete(key);
    return current.length;
  }
}
