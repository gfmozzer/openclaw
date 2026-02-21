export type RuntimeWorkerTask = {
  id: string;
  tenantId: string;
  agentId: string;
  sessionKey: string;
  runId: string;
  timestamp: number;
  channel: string;
  accountId?: string;
  threadId?: string;
  input: {
    text?: string;
    attachments?: Array<{
      type: string;
      url?: string;
      path?: string;
      metadata?: Record<string, unknown>;
    }>;
    metadata?: Record<string, unknown>;
  };
};

export type RuntimeWorkerEvent =
  | {
      type: "run.started";
      taskId: string;
      runId: string;
      timestamp: number;
    }
  | {
      type: "run.delta";
      taskId: string;
      runId: string;
      timestamp: number;
      text: string;
    }
  | {
      type: "run.tool";
      taskId: string;
      runId: string;
      timestamp: number;
      toolName: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "run.completed";
      taskId: string;
      runId: string;
      timestamp: number;
      output: {
        text?: string;
        payload?: Record<string, unknown>;
      };
    }
  | {
      type: "run.failed";
      taskId: string;
      runId: string;
      timestamp: number;
      error: {
        code: string;
        message: string;
        retryable?: boolean;
      };
    };

