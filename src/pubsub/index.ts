import config from "../config";
import PubSub from "./generic-pubsub";
import GooglePubSub from "./google-pubsub";
import RedisPubSub from "./redis";

export default function makePubSub(): PubSub {
  switch (config.pubsub) {
    case 'GCP':
      return new GooglePubSub();
    case 'REDIS':
      return new RedisPubSub();
  }
}
