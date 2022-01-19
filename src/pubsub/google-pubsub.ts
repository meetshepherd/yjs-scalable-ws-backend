import { PubSub as GCPubSub } from "@google-cloud/pubsub";
import config from "../config";
import PubSub from "./generic-pubsub";

const createTopic = async (pubsub: GCPubSub, {topic: topicName_}: {topic: string}) => {
  const topicName = `shp-${topicName_}`;

  let topic = pubsub.topic(topicName);

  const [topicExists] = await topic.exists();

  if(!topicExists) {
    [topic] =  await pubsub.createTopic(topicName);
    // console.log(`Topic created ${topicName}`);
  } else {
    // console.log(`Topic exists ${topicName}`);
  }

  return { topic };
}

const createTopicAndSubscription = async (pubsub: GCPubSub, {topic: topicName_, subscription: subscriptionName_}: {topic: string, subscription: string}) => {
  const topicName = `shp-${topicName_}`;
  const subscriptionName = `shp-${subscriptionName_}-${config.containerUniqueId}`;
  
  let topic = pubsub.topic(topicName);

  const [topicExists] = await topic.exists();

  if(!topicExists) {
    [topic] =  await pubsub.createTopic(topicName);
    // console.log(`Topic created ${topicName}`);
  } else {
    // console.log(`Topic exists ${topicName}`);
  }

  let subscription = topic.subscription(subscriptionName);

  const [subscriptionExists] = await subscription.exists()

  if(!subscriptionExists) {
    [subscription] = await topic.createSubscription(subscriptionName)
    // console.log(`Subscription created ${subscriptionName}`);
  } else {
    // console.log(`Subscription exists ${subscriptionName}`);
  }

  return {topic, subscription};
}

export default class GooglePubSub implements PubSub {
  private pubsub = new GCPubSub({
    projectId: config.gcp.projectId,
  });

  public async publish(topic: string, data: Uint8Array) {
    const {topic: t} = await createTopicAndSubscription(this.pubsub,{
      topic,
      subscription: topic,
    });
    await t.publishMessage({
      data: Buffer.from(data),
    });
  }

  public async subscribe(topic: string, callback: (data: Uint8Array, sub: GCPubSub) => void) {
    const {subscription: s} = await createTopicAndSubscription(this.pubsub,{
      topic,
      subscription: topic,
    });
    s.on("message", (message) => {
      callback(message.data, this.pubsub);
    });
  }

  public async unsubscribe(topic: string) {
    // The following logic is the usual flow for unsubscribing.
    // It is commented out, though, because it introduces more
    // problems than it solves. Unsubscribing introduces an
    // unnecessay race condition.

    // Checking for creation might yield a positive (subscription
    // already exists), whilst the subscription is actually being destroyed.

    // This edge case shouldn't really occur often, but in the case
    // of Google Pub/Sub, we can just rely on their expiration
    // clocks.


    // const subName = `shp-${topic}-${config.containerUniqueId}`;
    // let topicObj = this.pubsub.topic(subName);

    // const [topicExists] = await topicObj.exists();

    // if(!topicExists) {
    //   return;
    // }

    // let subscription = topicObj.subscription(subName);

    // const [subscriptionExists] = await subscription.exists()
  
    // if(!subscriptionExists) {
    //   return;
    // }

    // this.pubsub.subscription(subName).delete();
  }
}