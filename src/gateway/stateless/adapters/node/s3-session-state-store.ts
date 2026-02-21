import type {
  SessionPatch,
  SessionScope,
  SessionState,
  SessionStateStore,
} from "../../contracts/session-state-store.js";
import {
  createS3Client,
  deleteObject,
  encodePathPart,
  listKeys,
  readObjectText,
  type S3StatelessConfig,
  writeObjectJson,
} from "./s3-shared.js";

function normalizeState(value: unknown): SessionState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as SessionState;
  if (!entry.scope || !entry.sessionId) {
    return null;
  }
  return entry;
}

export class S3SessionStateStore implements SessionStateStore {
  constructor(private readonly config: S3StatelessConfig) {}

  private readonly client = createS3Client(this.config);

  private key(scope: SessionScope): string {
    return [
      this.config.rootPrefix,
      "tenants",
      encodePathPart(scope.tenantId),
      "sessions",
      `${encodePathPart(scope.agentId)}--${encodePathPart(scope.sessionKey)}.json`,
    ].join("/");
  }

  private prefixForTenant(tenantId: string): string {
    return [
      this.config.rootPrefix,
      "tenants",
      encodePathPart(tenantId),
      "sessions",
      "",
    ].join("/");
  }

  async get(scope: SessionScope): Promise<SessionState | null> {
    const raw = await readObjectText({
      client: this.client,
      bucket: this.config.bucket,
      key: this.key(scope),
    });
    if (!raw) {
      return null;
    }
    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async upsert(state: SessionState): Promise<void> {
    await writeObjectJson({
      client: this.client,
      bucket: this.config.bucket,
      key: this.key(state.scope),
      value: state,
    });
  }

  async patch(scope: SessionScope, patch: SessionPatch): Promise<SessionState | null> {
    const existing = await this.get(scope);
    if (!existing) {
      return null;
    }
    const updated: SessionState = {
      ...existing,
      ...patch,
      scope: existing.scope,
      route: patch.route ?? existing.route,
      metadata: patch.metadata ?? existing.metadata,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    await this.upsert(updated);
    return updated;
  }

  async delete(scope: SessionScope): Promise<boolean> {
    const existing = await this.get(scope);
    if (!existing) {
      return false;
    }
    await deleteObject({
      client: this.client,
      bucket: this.config.bucket,
      key: this.key(scope),
    });
    return true;
  }

  async listByTenant(
    tenantId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<SessionState[]> {
    const limit = Math.max(1, Math.min(500, opts?.limit ?? 100));
    const listed = await listKeys({
      client: this.client,
      bucket: this.config.bucket,
      prefix: this.prefixForTenant(tenantId),
      continuationToken: opts?.cursor,
      maxKeys: limit,
    });
    const states: SessionState[] = [];
    for (const key of listed.keys) {
      const raw = await readObjectText({
        client: this.client,
        bucket: this.config.bucket,
        key,
      });
      if (!raw || raw.trim() === "null") {
        continue;
      }
      try {
        const parsed = normalizeState(JSON.parse(raw));
        if (parsed) {
          states.push(parsed);
        }
      } catch {
        // ignore malformed entries
      }
      if (states.length >= limit) {
        break;
      }
    }
    return states;
  }
}
