import type {
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
} from "../../contracts/memory-store.js";
import {
  createS3Client,
  encodePathPart,
  readObjectText,
  type S3StatelessConfig,
  writeObjectJson,
} from "./s3-shared.js";

function normalizeEntries(value: unknown): MemoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "object" && item !== null) as MemoryEntry[];
}

export class S3MemoryStore implements MemoryStore {
  constructor(private readonly config: S3StatelessConfig) {}

  private readonly client = createS3Client(this.config);

  private key(scope: MemoryScope): string {
    return [
      this.config.rootPrefix,
      "tenants",
      encodePathPart(scope.tenantId),
      "agents",
      encodePathPart(scope.agentId),
      "sessions",
      encodePathPart(scope.sessionKey),
      "memory.json",
    ].join("/");
  }

  private async load(scope: MemoryScope): Promise<MemoryEntry[]> {
    const raw = await readObjectText({
      client: this.client,
      bucket: this.config.bucket,
      key: this.key(scope),
    });
    if (!raw) {
      return [];
    }
    try {
      return normalizeEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async save(scope: MemoryScope, entries: MemoryEntry[]): Promise<void> {
    await writeObjectJson({
      client: this.client,
      bucket: this.config.bucket,
      key: this.key(scope),
      value: entries,
    });
  }

  async append(entry: MemoryEntry): Promise<void> {
    const current = await this.load(entry.scope);
    current.push(entry);
    await this.save(entry.scope, current);
  }

  async appendMany(entries: MemoryEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const grouped = new Map<string, { scope: MemoryScope; entries: MemoryEntry[] }>();
    for (const entry of entries) {
      const key = `${entry.scope.tenantId}:${entry.scope.agentId}:${entry.scope.sessionKey}`;
      const current = grouped.get(key);
      if (current) {
        current.entries.push(entry);
      } else {
        grouped.set(key, { scope: entry.scope, entries: [entry] });
      }
    }
    for (const group of grouped.values()) {
      const current = await this.load(group.scope);
      current.push(...group.entries);
      await this.save(group.scope, current);
    }
  }

  async list(scope: MemoryScope, query?: MemoryQuery): Promise<MemoryEntry[]> {
    const all = await this.load(scope);
    const before = query?.before;
    const after = query?.after;
    const limit = Math.max(1, query?.limit ?? (all.length || 1));
    return all
      .filter((entry) => (before == null ? true : entry.timestamp < before))
      .filter((entry) => (after == null ? true : entry.timestamp > after))
      .slice(-limit);
  }

  async compact(scope: MemoryScope, opts: { keepLast: number }): Promise<number> {
    const all = await this.load(scope);
    const keepLast = Math.max(0, opts.keepLast);
    if (all.length <= keepLast) {
      return 0;
    }
    const removed = all.length - keepLast;
    await this.save(scope, all.slice(-keepLast));
    return removed;
  }

  async deleteScope(scope: MemoryScope): Promise<number> {
    const all = await this.load(scope);
    await this.save(scope, []);
    return all.length;
  }
}

