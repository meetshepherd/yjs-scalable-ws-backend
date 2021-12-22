import Redis from 'ioredis';

import PubSub from './generic-pubsub';
import config from '../config';

export default class RedisPubSub implements PubSub {
  private pub = new Redis(config.redis);

  private sub = new Redis(config.redis);

  public async publish(topic: string, data: Uint8Array) {
    this.pub.publishBuffer(topic, Buffer.from(data));
  }

  public async subscribe(
    topic: string,
    callback: (update: Buffer, sub: Redis.Redis) => void,
  ): Promise<void> {
    await this.sub.subscribe(topic);
    this.sub.on('messageBuffer', (channel, update) => {
      if (channel.toString() !== topic) {
        return;
      }

      callback(update, this.sub);
    });
  }

  public async unsubscribe(topic: string): Promise<void> {
    this.sub.unsubscribe(topic);
  }
}
