import * as assert from 'assert-plus';
import * as dbg from 'debug';
import { Options, Channel } from 'amqplib';
import { Pipeline } from 'middles';
import { EventEmitter } from 'events';

import { ConsumerOptions, ChannelProvider } from './common';
import { Message } from './message';
import { ConsumerMiddleware } from './consumer-middleware';
import { makeErrorPropagation, Cleanup, makeCleanupPropagation, addCleanupTask, iid } from './cleanup';

const debug = dbg('fiver:consumer');

const $channel = Symbol('channel');

export interface MessageError {
  error: Error;
  message: Message;
}

export class Consumer extends EventEmitter {
  private [$channel]: Channel;

  private middleware: Pipeline<Message>;
  public options: ConsumerOptions;
  public provider: ChannelProvider;
  public consumerTag: string;

  constructor(provider: ChannelProvider, options?: ConsumerOptions) {
    super();
    this.provider = provider;
    this.options = options || {};
    this.middleware =
      options && options.useDefaultMiddleware
        ? new Pipeline<Message>().add(ConsumerMiddleware.default)
        : new Pipeline<Message>();
    // ensure we get the message first.
    this.on('message', this.handler.bind(this));
    this.on('close', () => {
      debug(`Consumer ${iid(this)} closed`);
    });
    this.on('canceled', () => {
      debug(`Consumer ${iid(this)} canceled`);
    });
    debug(`constructed Consumer ${iid(this)}`);
  }

  async channel(): Promise<Channel> {
    if (!this[$channel]) {
      const {
        provider,
        options: { publisher, publisherConfirms },
      } = this;
      // prefer to use the same channel as the publisher.
      const ch = await (publisher ? publisher.channel() : provider.channel(publisherConfirms));
      const errHandler = makeErrorPropagation('connection', (ch as unknown) as Cleanup, this);
      const closeHandler = makeCleanupPropagation('connection', 'close', (ch as unknown) as Cleanup, this);
      ch.on('error', errHandler);
      ch.on('close', closeHandler);
      addCleanupTask((ch as unknown) as Cleanup, () => {
        if (this[$channel]) {
          debug(`Consumer ${iid(this)} cleaned up channel ${iid(this[$channel])}`);
          this[$channel] = null;
        }
      });
      this[$channel] = ch;
    }
    return this[$channel];
  }

  async consume(queue: string, options?: Options.Consume): Promise<void> {
    const ch = await this.channel();
    this[$channel] = ch;
    const {
      options: { publisher },
    } = this;
    // resolve the confusing double-negative on acknowledging messages.
    const consumerAck: boolean = options && !options.noAck;
    const consumer = await ch.consume(
      queue,
      async message => {
        if (message === null) {
          await this.cancel();
          return;
        }
        let msg = new Message(ch, message, consumerAck || false, publisher);
        try {
          msg = await this.middleware.push(msg);
          this.emit('message', msg);
        } catch (error) {
          this.emit('message-error', { error, message: msg });
        }
      },
      options
    );
    debug(`Consumer ${iid(this)} opened tag ${consumer.consumerTag}`);
    this.consumerTag = consumer.consumerTag;
    this.once('canceled', () => {
      this.consumerTag = null;
      debug(`Consumer ${iid(this)} canceled tag ${consumer.consumerTag}`);
    });
  }

  protected handler(message: Message): void {
    assert.object(message, 'message');
  }

  async cancel(): Promise<void> {
    if (this.consumerTag && this[$channel]) {
      await this[$channel].cancel(this.consumerTag);
      this.emit('canceled', {
        source: 'server',
      });
    }
    this.consumerTag = null;
  }

  async close(): Promise<void> {
    if (this[$channel]) {
      this.emit('close', { source: 'self' });
      return this.cancel();
    }
  }
}

export type ConsumerOp<T> = (consumer: Consumer) => Promise<T>;
