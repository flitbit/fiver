import * as assert from 'assert-plus';
import * as amqp from 'amqplib';
import { Publisher } from './publisher';

const $channel = Symbol('channel');
const $publisher = Symbol('publisher');
const $message = Symbol('message');

export class Message {
  private [$channel]: amqp.Channel;
  private [$publisher]: Publisher;
  private [$message]: amqp.Message;
  public fields: amqp.MessageFields;
  public properties: amqp.MessageProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public content: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(channel: amqp.Channel, publisher: Publisher, message: amqp.Message, decodedContent?: any) {
    assert.object(channel, 'channel');
    assert.object(publisher, 'publisher');
    assert.object(message, 'message');
    const { fields, properties, content } = message;
    this[$channel] = channel;
    this[$channel].on('close', () => {
      this[$channel] = null;
    });
    this[$publisher] = publisher;
    this[$message] = message;
    this.fields = fields;
    this.properties = properties;
    this.content = decodedContent || content;
  }

  async ack(allUpTo: boolean): Promise<void> {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    await this[$channel].ack(this[$message], allUpTo);
  }

  async nack(allUpTo: boolean, requeue: boolean): Promise<void> {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    await this[$channel].nack(this[$message], allUpTo, requeue);
  }

  async reply(): Promise<void> {
    if (!this[$channel]) {
      throw new Error('Invalid state; channel closed');
    }
    return Promise.reject();
  }
}
