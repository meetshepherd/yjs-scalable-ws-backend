import Redis from 'ioredis';

import PubSub from './generic-pubsub';
import config from '../config';

export default class RedisPubSub implements PubSub {
  private pub = new Redis(config.redis);

  private sub = new Redis(config.redis);

  public async publish(topic_: string, data: Uint8Array) {
    const topic = `shp-${topic_}`;
    this.pub.publishBuffer(topic, Buffer.from(data));
  }

  public async subscribe(
    topic_: string,
    callback: (update: Buffer, sub: Redis.Redis) => void,
  ): Promise<void> {
    const topic = `shp-${topic_}`;
    await this.sub.subscribe(topic);
    this.sub.on('messageBuffer', (channel, update) => {
      if (channel.toString() !== topic) {
        return;
      }

      callback(update, this.sub);
    });
  }

  public async unsubscribe(topic_: string): Promise<void> {
    const topic = `shp-${topic_}`;
    this.sub.unsubscribe(topic);
  }
}
