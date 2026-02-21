export type BusMessage<TPayload = unknown> = {
  id: string;
  topic: string;
  tenantId: string;
  timestamp: number;
  payload: TPayload;
  headers?: Record<string, string>;
};

export type BusSubscription = {
  close: () => Promise<void>;
};

export interface MessageBus {
  publish<TPayload>(message: BusMessage<TPayload>): Promise<void>;
  publishMany<TPayload>(messages: Array<BusMessage<TPayload>>): Promise<void>;
  subscribe<TPayload>(
    topic: string,
    handler: (message: BusMessage<TPayload>) => Promise<void>,
  ): Promise<BusSubscription>;
}

