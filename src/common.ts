import { Channel } from 'amqplib';

export interface BrokerOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socketOptions?: any;
}

export interface PublisherOptions {
  publisherConfirms?: boolean;
  autoConfirm?: boolean;
  useDefaultCoercions?: boolean;
}

export type BrokerEventSource = 'connection' | 'confirmChannel' | 'channel';
export interface BrokerEvent {
  source: BrokerEventSource;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface ChannelProvider {
  channel(publisherConfirms?: boolean): Promise<Channel>;
}
