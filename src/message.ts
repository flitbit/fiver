import * as assert from 'assert-plus';
import * as amqp from 'amqplib';
import { Options } from 'amqplib';
import { LoggingLevel, MiddlewareLog, Publisher } from './common';

const $channel = Symbol('channel');
const $publisher = Symbol('publisher');
const $message = Symbol('message');
const $ackState = Symbol('ackState');
const $state = Symbol('state');
const $log = Symbol('log');

const AckStates = {
  None: 0,
  Needed: 1,
  Acked: 1 << 1,
  Nacked: 1 << 2,
  Rejected: 1 << 3,
};

const Acknowledged = AckStates.Acked | AckStates.Nacked | AckStates.Rejected;

export class Message {
  private [$channel]: amqp.Channel;
  private [$publisher]: Publisher | undefined;
  private [$message]: amqp.Message;
  private [$ackState]: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private [$state]: Map<string, any>;
  private [$log]: MiddlewareLog[];
  public fields: amqp.MessageFields;
  public properties: amqp.MessageProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public content: any;

  /**
   * Creates a new instance.
   * @param channel the AMQP channel the message arrived on
   * @param message the raw message from the underlying amqplib
   * @param consumerAck indicates that the consumer must acknowledge or reject the message during processing
   * @param publisher an optional publisher, if present enables reply method.
   */
  constructor(channel: amqp.Channel, message: amqp.Message, consumerAck: boolean, publisher?: Publisher) {
    assert.object(channel, 'channel');
    assert.object(message, 'message');
    assert.bool(consumerAck, 'consumerAck');
    const { fields, properties, content } = message;
    this[$channel] = channel;
    this[$publisher] = publisher;
    this[$message] = message;
    this[$ackState] = consumerAck ? AckStates.Needed : AckStates.None;
    this.fields = fields;
    this.properties = properties;
    this.content = content;
  }

  get destination(): string {
    const {
      fields: { exchange, routingKey },
    } = this;
    return `${exchange}:${routingKey}`;
  }

  get needsAck(): boolean {
    // needs ack but not already acknowledged (in any way).
    return (this[$ackState] & AckStates.Needed) > 0 && (this[$ackState] & Acknowledged) === 0;
  }
  get isAcked(): boolean {
    return (this[$ackState] & AckStates.Acked) > 0;
  }
  get isNacked(): boolean {
    return (this[$ackState] & AckStates.Nacked) > 0;
  }
  get isRejected(): boolean {
    return (this[$ackState] & AckStates.Rejected) > 0;
  }

  set<V>(key: string, value: V): void {
    if (key) {
      if (!this[$state]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this[$state] = new Map<string, any>();
      }
      this[$state].set(key, value);
    }
  }

  get<V>(key: string): V | undefined {
    if (key) {
      if (this[$state]) {
        return undefined;
      }
      return this[$state].get(key);
    }
  }

  middlewareLog(level: LoggingLevel, message: string): MiddlewareLog[] {
    if (level && message) {
      if (!this[$log]) {
        this[$log] = [];
      }
      this[$log].push({ level, message });
    }
    return this[$log];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrideContent(content: any): Message {
    this.content = content;
    return this;
  }

  ack(allUpTo?: boolean): void {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    if (this.needsAck) {
      this[$channel].ack(this[$message], allUpTo);
      this[$ackState] = this[$ackState] | AckStates.Acked;
    }
  }

  nack(allUpTo?: boolean, requeue?: boolean): void {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    if (this.needsAck) {
      this[$channel].nack(this[$message], allUpTo, requeue);
      this[$ackState] = this[$ackState] | AckStates.Nacked;
    }
  }

  reject(requeue?: boolean): void {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    if (this.needsAck) {
      this[$channel].reject(this[$message], requeue);
      this[$ackState] = this[$ackState] | AckStates.Rejected;
    }
  }

  async reply(content: string | object | Buffer, options?: Options.Publish): Promise<amqp.Channel | undefined> {
    assert.ok(content);
    assert.optionalObject(options, 'options');
    const {
      properties: { replyTo, correlationId },
    } = this;
    options = Object.assign(options || {}, { correlationId });
    return this[$publisher]?.publish(replyTo, content, options);
  }
}
