export type MemoryScope = {
  tenantId: string;
  agentId: string;
  sessionKey: string;
};

export type MemoryEntry = {
  id: string;
  scope: MemoryScope;
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
  timestamp: number;
  runId?: string;
  metadata?: Record<string, unknown>;
};

export type MemoryQuery = {
  limit?: number;
  before?: number;
  after?: number;
};

export interface MemoryStore {
  append(entry: MemoryEntry): Promise<void>;
  appendMany(entries: MemoryEntry[]): Promise<void>;
  list(scope: MemoryScope, query?: MemoryQuery): Promise<MemoryEntry[]>;
  compact(scope: MemoryScope, opts: { keepLast: number }): Promise<number>;
  deleteScope(scope: MemoryScope): Promise<number>;
}

