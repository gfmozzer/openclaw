export type AuditEventEntry = {
  tenantId: string;
  requesterId?: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
};

export type AuditEventQuery = {
  tenantId: string;
  limit?: number;
  after?: string;
  action?: string;
};

export interface AuditEventStore {
  append(event: AuditEventEntry): Promise<void>;
  list(query: AuditEventQuery): Promise<AuditEventEntry[]>;
}
