import * as assert from 'assert-plus';
import { Pipeline } from 'middles';
import { Message } from './message';
import { Publisher } from './publisher';
import { Options, Replies } from 'amqplib';
import { EventEmitter } from 'events';

const $consumer = Symbol('consumer');

export class BaseConsumer extends EventEmitter {
  private [$consumer]: Replies.Consume;
  private publisher: Publisher;
  private middleware: Pipeline<Message>;

  constructor(publisher: Publisher) {
    super();
    this.publisher = publisher;
    this.middleware = new Pipeline<Message>();
    // ensure we get the message first.
    this.on('message', this.handler.bind(this));
  }

  async consume(queue: string, options?: Options.Consume): Promise<void> {
    const ch = await this.publisher.channel();
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
        try {
          const msg = await this.middleware.push(new Message(ch, this.publisher, message));
          this.emit('message', msg);
        } catch (e) {
          this.emit('error', e);
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
