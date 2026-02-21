import type {
  BusMessage,
  BusSubscription,
  MessageBus,
} from "../../contracts/message-bus.js";

type TopicHandler = (message: BusMessage<unknown>) => Promise<void>;

export class InMemoryMessageBus implements MessageBus {
  private readonly handlers = new Map<string, Set<TopicHandler>>();

  async publish<TPayload>(message: BusMessage<TPayload>): Promise<void> {
    const topicHandlers = this.handlers.get(message.topic);
    if (!topicHandlers || topicHandlers.size === 0) {
      return;
    }
    const wrapped = message as BusMessage<unknown>;
    await Promise.all(Array.from(topicHandlers).map((handler) => handler(wrapped)));
  }

  async publishMany<TPayload>(messages: Array<BusMessage<TPayload>>): Promise<void> {
    for (const message of messages) {
      await this.publish(message);
    }
  }

  async subscribe<TPayload>(
    topic: string,
    handler: (message: BusMessage<TPayload>) => Promise<void>,
  ): Promise<BusSubscription> {
    const topicHandlers = this.handlers.get(topic) ?? new Set<TopicHandler>();
    const wrapped: TopicHandler = async (message) => {
      await handler(message as BusMessage<TPayload>);
    };
    topicHandlers.add(wrapped);
    this.handlers.set(topic, topicHandlers);
    return {
      close: async () => {
        const set = this.handlers.get(topic);
        if (!set) {
          return;
        }
        set.delete(wrapped);
        if (set.size === 0) {
          this.handlers.delete(topic);
        }
      },
    };
  }
}

