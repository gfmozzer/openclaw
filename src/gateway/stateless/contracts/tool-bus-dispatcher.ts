export type ToolBusDispatchRequest = {
  tenantId?: string;
  agentId?: string;
  sessionKey: string;
  skillName: string;
  commandName: string;
  toolName: string;
  command: string;
  provider?: string;
  surface?: string;
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string | number;
  metadata?: Record<string, unknown>;
};

export type ToolBusDispatchResult = {
  ok: boolean;
  outputText?: string;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

export interface ToolBusDispatcher {
  dispatch(request: ToolBusDispatchRequest): Promise<ToolBusDispatchResult>;
}
