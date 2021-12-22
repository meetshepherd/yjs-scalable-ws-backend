import { PubSub as GCPubSub } from "@google-cloud/pubsub";
import { string } from "lib0";
import config from "../config";
import PubSub from "./generic-pubsub";

const createTopicAndSubscription = async (pubsub: GCPubSub, {topic: topicName, subscription: subscriptionName}: {topic: string, subscription: string}) => {
  let topic = pubsub.topic(topicName);

  const [topicExists] = await topic.exists();

  if(!topicExists) {
      [topic] =  await pubsub.createTopic(topicName);
      console.log(`Topic created ${topicName}`);
  } else {
      console.log(`Topic exists ${topicName}`);
  }

  let subscription = topic.subscription(subscriptionName);

  const [subscriptionExists] = await subscription.exists()

  if(!subscriptionExists) {
      [subscription] = await topic.createSubscription(subscriptionName)
      console.log(`Subscription created ${topicName}`);
  } else {
      console.log(`Subscription exists ${topicName}`);
  }

  return {topic, subscription};
}

export default class GooglePubSub implements PubSub {
  private pubusub = new GCPubSub({
    projectId: config.gcp.projectId,
  });

  public async publish(topic: string, data: Uint8Array) {
    const {topic: t, subscription: s} = await createTopicAndSubscription(this.pubusub,{
      topic,
      subscription: `${topic}-sub`,
    });
    await t.publishMessage({
      data: Buffer.from(data),
    });
  }

  public async subscribe(topic: string, callback: (data: Uint8Array, sub: GCPubSub) => void) {
    const {topic: t, subscription: s} = await createTopicAndSubscription(this.pubusub,{
      topic,
      subscription: `${topic}-sub`,
    });
    s.on("message", (message) => {
      callback(message.data, this.pubusub);
    });
  }

  public async unsubscribe(topic: string) {
    this.pubusub.subscription(`${topic}-sub`).delete();
  }
}