import type {
  BusMessage,
  BusSubscription,
  MessageBus,
} from "../../contracts/message-bus.js";
import type { RedisRuntimeConfig } from "./redis-shared.js";
import { RedisClientFactory } from "./redis-shared.js";

function topicChannel(prefix: string, topic: string): string {
  return `${prefix}:bus:${topic}`;
}

function parseBusMessage(raw: string): BusMessage<unknown> | null {
  try {
    const parsed = JSON.parse(raw) as BusMessage<unknown>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.topic !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class RedisMessageBus implements MessageBus {
  private readonly clients: RedisClientFactory;

  constructor(private readonly config: RedisRuntimeConfig) {
    this.clients = new RedisClientFactory(config);
  }

  async publish<TPayload>(message: BusMessage<TPayload>): Promise<void> {
    const redis = await this.clients.getCommandClient();
    const channel = topicChannel(this.config.prefix, message.topic);
    await redis.sendCommand(["PUBLISH", channel, JSON.stringify(message)]);
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
    const channel = topicChannel(this.config.prefix, topic);
    const subscriptionClient = await this.clients.createSubscriptionClient();
    await subscriptionClient.subscribe(channel, (raw) => {
      const parsed = parseBusMessage(raw);
      if (!parsed) {
        return;
      }
      void handler(parsed as BusMessage<TPayload>);
    });
    return {
      close: async () => {
        await subscriptionClient.unsubscribe(channel);
        await subscriptionClient.quit();
      },
    };
  }
}

