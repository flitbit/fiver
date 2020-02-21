import { Channel, Options } from 'amqplib';

export interface BrokerOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socketOptions?: any;
}

export interface ChannelProvider {
  channel(publisherConfirms?: boolean): Promise<Channel>;
}

export interface Publisher {
  channel(): Promise<Channel>;
  publish(
    destination: string | string[],
    content: string | object | Buffer,
    options?: Options.Publish
  ): Promise<Channel>;

  close(): void;
}

export type PublisherOp<T> = (publisher: Publisher) => Promise<T>;

export interface PublisherOptions {
  publisherConfirms?: boolean;
  autoConfirm?: boolean;
  useDefaultMiddleware?: boolean;
}

export interface ConsumerOptions {
  publisherConfirms?: boolean;
  autoConfirm?: boolean;
  useDefaultMiddleware?: boolean;
  publisher?: Publisher;
}

export type BrokerEventSource = 'self' | 'connection' | 'confirmChannel' | 'channel';
export interface BrokerEvent {
  source: BrokerEventSource;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export type LoggingLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MiddlewareLog {
  level: LoggingLevel;
  message: string;
}
