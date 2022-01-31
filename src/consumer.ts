import * as assert from 'assert-plus';
import dbg from 'debug';
import { Options, Channel } from 'amqplib';
import { Pipeline } from 'middles';
import { EventEmitter } from 'events';

import { ConsumerOptions, ChannelProvider } from './common';
import { Message } from './message';
import { ConsumerMiddleware } from './consumer-middleware';
import { addCleanupTask, cleanupPropagationEvent, iid } from 'cleanup-util';

const debug = dbg.debug('fiver:consumer');

const $channel = Symbol('channel');

export interface MessageError {
  error: Error;
  message: Message;
}

export class Consumer extends EventEmitter {
  private [$channel]: Channel | null;

  private middleware: Pipeline<Message>;
  public options: ConsumerOptions;
  public provider: ChannelProvider;
  public consumerTag?: string;

  constructor(provider: ChannelProvider, options?: ConsumerOptions) {
    super();
    this.provider = provider;
    this.options = options || {};
    this.middleware =
      options && options.useDefaultMiddleware
        ? new Pipeline<Message>().useAsync(...ConsumerMiddleware.default)
        : new Pipeline<Message>();
    // ensure we get the message first.
    this.on('message', this.handler.bind(this));
    this.on('close', () => {
      debug(`${iid(this)} closed`);
    });
    this.on('canceled', () => {
      debug(`${iid(this)} canceled`);
    });
    debug(`new ${iid(this)}`);
  }

  async channel(): Promise<Channel> {
    if (this[$channel]) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return this[$channel]!;
    }
    const {
      provider,
      options: { publisher, publisherConfirms },
    } = this;
    // prefer to use the same channel as the publisher.
    const ch = await (publisher ? publisher.channel() : provider.channel(publisherConfirms));
    cleanupPropagationEvent(
      ch,
      'close',
      () => {
        this.emit('close', {
          source: 'channel',
          sender: ch,
        });
      },
      this
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errHandler = (e: any): void => {
      this.emit('error', {
        source: 'channel',
        sender: ch,
        error: e,
      });
    };
    ch.on('error', errHandler);
    addCleanupTask(ch, this, () => {
      if (this[$channel] === ch) {
        debug(`${iid(this)} cleaned up ${iid(ch)}`);
        this[$channel] = null;
      }
      this.removeListener('error', errHandler);
    });
    debug(`${iid(this)} using ${iid(ch)}`);
    this[$channel] = ch;
    return ch;
  }

  async consume(queue: string, options?: Options.Consume): Promise<void> {
    const {
      options: { publisher },
    } = this;
    // resolve the confusing double-negative on acknowledging messages.
    let consumerAck = false;
    if (options && !options.noAck) {
      consumerAck = true;
    }
    const ch = await this.channel();
    const consumer = await ch.consume(
      queue,
      async (message) => {
        if (message === null) {
          await this.cancel();
          return;
        }
        let msg = new Message(ch, message, consumerAck || false, publisher);
        try {
          msg = await this.middleware.pushAsync(msg);
          this.emit('message', msg);
        } catch (error) {
          this.emit('message-error', { error, message: msg });
        }
      },
      options
    );
    debug(`${iid(this)} opened tag ${consumer.consumerTag}`);
    this.consumerTag = consumer.consumerTag;
    this.once('canceled', () => {
      this.consumerTag = undefined;
      debug(`${iid(this)} canceled tag ${consumer.consumerTag}`);
    });
  }

  protected handler(message: Message): void {
    assert.object(message, 'message');
  }

  async cancel(): Promise<void> {
    if (this.consumerTag && this[$channel]) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await this[$channel]!.cancel(this.consumerTag);
      this.emit('canceled', {
        source: 'server',
      });
    }
    this.consumerTag = undefined;
  }

  async close(): Promise<void> {
    if (this[$channel]) {
      await this.cancel();
      this.emit('close', { source: 'self' });
    }
  }
}

export type ConsumerOp<T> = (consumer: Consumer) => Promise<T>;
