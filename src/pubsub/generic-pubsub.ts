export default interface PubSub {
  publish(topic: string, data: any): Promise<void>;
  subscribe(topic: string, callback: (data: any, sub: any) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
}
