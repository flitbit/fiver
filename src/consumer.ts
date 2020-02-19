import * as assert from 'assert-plus';
import { Pipeline } from 'middles';
import { Message } from './message';
import { Publisher } from './publisher';
import { Options, Replies } from 'amqplib';
import { EventEmitter } from 'events';
import { ConsumerOptions } from './common';
import { ConsumerMiddleware } from './consumer-middleware';

const $consumer = Symbol('consumer');

export interface MessageError {
  error: Error;
  message: Message;
}

export class BaseConsumer extends EventEmitter {
  private [$consumer]: Replies.Consume;
  private publisher: Publisher;
  private middleware: Pipeline<Message>;

  constructor(publisher: Publisher, options?: ConsumerOptions) {
    super();
    this.publisher = publisher;
    this.middleware =
      options && options.useDefaultMiddleware
        ? new Pipeline<Message>().add(ConsumerMiddleware.default)
        : new Pipeline<Message>();
    // ensure we get the message first.
    this.on('message', this.handler.bind(this));
  }

  async consume(queue: string, options?: Options.Consume): Promise<void> {
    const ch = await this.publisher.channel();
    // resolve the confusing double-negative on acknowledging messages.
    const consumerAck: boolean = options && !options.noAck;
    this[$consumer] = await ch.consume(
      queue,
      async message => {
        this[$consumer] = null;
        if (message === null) {
          this.emit('canceled', {
            source: 'server',
          });
          return;
        }
        let msg = new Message(ch, this.publisher, message, consumerAck || false);
        try {
          msg = await this.middleware.push(msg);
          this.emit('message', msg);
        } catch (error) {
          this.emit('message-error', { error, message: msg });
        }
      },
      options
    );
  }

  handler(message: Message): void {
    assert.object(message, 'message');
  }

  async cancel(): Promise<void> {
    if (this[$consumer]) {
      const ch = await this.publisher.channel();
      await ch.cancel(this[$consumer].consumerTag);
    }
  }
}
