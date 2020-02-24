import * as assert from 'assert-plus';
import * as dbg from 'debug';
import { EventEmitter } from 'events';
import { connect, Connection, Options, ConfirmChannel, Channel, Replies } from 'amqplib';

import { PublisherOptions, ChannelProvider, BrokerOptions, Publisher } from './common';
import { PublisherImpl } from './publisher';
import { cleanupPropagationEvent, addCleanupTask, iid } from 'cleanup-util';

const debug = dbg('fiver:broker');

interface Channels {
  normal?: Channel;
  confirming?: ConfirmChannel;
}

export type ExchangeType = 'direct' | 'topic' | 'headers' | 'fanout';

const $connection = Symbol('connection');
const $publisher = Symbol('publisher');

export class Broker extends EventEmitter implements ChannelProvider {
  private [$connection]: Connection;
  private [$publisher]: Publisher;
  private uriOrOptions: string | Options.Connect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socketOptions: any;
  private channels: Channels;
  public options: BrokerOptions;

  constructor(uriOrOptions: string | Options.Connect, options?: BrokerOptions) {
    assert.ok(
      typeof uriOrOptions === 'string' || (typeof uriOrOptions === 'object' && uriOrOptions !== null),
      'uriOrOptions (string | Options.Connect) is required'
    );
    assert.optionalObject(options, 'options');
    super();
    this.options = options || {};
    this.uriOrOptions = uriOrOptions;
    this.channels = {};
    this.on('close', ({ source }) => {
      if (source === 'self') {
        debug(`${iid(this)} closed`);
      }
    });
    debug(`new ${iid(this)}`);
  }

  async connect(): Promise<Connection> {
    if (this[$connection]) {
      return this[$connection];
    }
    const { uriOrOptions, socketOptions } = this;
    const cn = await connect(uriOrOptions, socketOptions);
    cleanupPropagationEvent(
      cn,
      'close',
      () => {
        this.emit('close', {
          source: 'connection',
          sender: cn,
        });
      },
      this
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errHandler = (e: any): void => {
      this.emit('error', {
        source: 'connection',
        sender: cn,
        error: e,
      });
    };
    cn.on('error', errHandler);
    addCleanupTask(cn, this, () => {
      if (this[$connection] === cn) {
        debug(`${iid(this)} cleaned up ${iid(cn)}`);
        this[$connection] = null;
      }
      this.removeListener('error', errHandler);
    });
    debug(`${iid(this)} using ${iid(cn)}`);
    this[$connection] = cn;
    this.emit('connect', { source: 'connection', data: cn });
    return cn;
  }

  async confirmChannel(): Promise<ConfirmChannel> {
    const {
      channels,
      channels: { confirming },
    } = this;
    if (confirming) {
      return confirming;
    }
    const cn = await this.connect();
    const ch = await cn.createConfirmChannel();
    cleanupPropagationEvent(
      ch,
      'close',
      () => {
        this.emit('close', {
          source: 'confirmChannel',
          sender: ch,
        });
      },
      this
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errHandler = (e: any): void => {
      this.emit('error', {
        source: 'confirmChannel',
        sender: ch,
        error: e,
      });
    };
    ch.on('error', errHandler);
    addCleanupTask(ch, this, () => {
      if (channels.confirming === ch) {
        debug(`${iid(this)} cleaned up ${iid(ch)}`);
        channels.confirming = null;
      }
      this.removeListener('error', errHandler);
    });
    this.emit('channel', { source: 'confirmChannel', data: ch });
    debug(`${iid(this)} using ${iid(ch)}`);
    return (channels.confirming = ch);
  }

  async channel(publisherConfirms?: boolean): Promise<Channel> {
    if (publisherConfirms) return this.confirmChannel();
    const {
      channels,
      channels: { normal },
    } = this;
    if (normal) {
      return normal;
    }
    const cn = await this.connect();
    const ch = await cn.createChannel();
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
      if (channels.normal === ch) {
        debug(`${iid(this)} cleaned up ${iid(ch)}`);
        channels.normal = null;
      }
      this.removeListener('error', errHandler);
    });
    this.emit('channel', { source: 'channel', data: ch });
    debug(`${iid(this)} using ${iid(ch)}`);
    return (channels.normal = ch);
  }

  async assertQueue(queue?: string, options?: Options.AssertQueue): Promise<Replies.AssertQueue> {
    const ch = await this.channel();
    return ch.assertQueue(queue || '', options);
  }

  async checkQueue(queue: string): Promise<Replies.AssertQueue> {
    const ch = await this.channel();
    return ch.checkQueue(queue);
  }

  async deleteQueue(queue: string): Promise<Replies.DeleteQueue> {
    const ch = await this.channel();
    return ch.deleteQueue(queue);
  }

  async purgeQueue(queue: string): Promise<Replies.PurgeQueue> {
    const ch = await this.channel();
    return ch.purgeQueue(queue);
  }

  async bindQueue<ArgsT>(queue: string, source: string, pattern: string, args?: ArgsT): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.bindQueue(queue, source, pattern, args);
  }

  async unbindQueue<ArgsT>(queue: string, source: string, pattern: string, args?: ArgsT): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.unbindQueue(queue, source, pattern, args);
  }

  async assertExchange(
    name: string,
    type: ExchangeType,
    options?: Options.AssertExchange
  ): Promise<Replies.AssertExchange> {
    const ch = await this.channel();
    return ch.assertExchange(name, type, options);
  }

  async checkExchange(name: string): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.checkExchange(name);
  }

  async deleteExchange(name: string): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.deleteExchange(name);
  }

  async bindExchange<ArgsT>(
    destination: string,
    source: string,
    pattern: string,
    args?: ArgsT
  ): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.bindExchange(destination, source, pattern, args);
  }

  async unbindExchange<ArgsT>(
    destination: string,
    source: string,
    pattern: string,
    args?: ArgsT
  ): Promise<Replies.Empty> {
    const ch = await this.channel();
    return ch.unbindExchange(destination, source, pattern, args);
  }

  createPublisher(options?: PublisherOptions): Publisher {
    return new PublisherImpl(this, options);
  }

  publisher(): Publisher {
    if (this[$publisher]) {
      return this[$publisher];
    }
    const { publisherOptions } = this.options;
    const pub = new PublisherImpl(this, publisherOptions);
    cleanupPropagationEvent(
      pub,
      'close',
      () => {
        this.emit('close', {
          source: 'publisher',
          sender: pub,
        });
      },
      this,
      'close'
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errHandler = (e: any): void => {
      this.emit('error', {
        source: 'publisher',
        sender: pub,
        error: e,
      });
    };
    pub.on('error', errHandler);
    addCleanupTask(pub, this, () => {
      if (this[$publisher] === pub) {
        debug(`${iid(this)} cleaned up ${iid(pub)}`);
        this[$publisher] = null;
      }
      this.removeListener('error', errHandler);
    });
    debug(`${iid(this)} using ${iid(pub)}`);
    this[$publisher] = pub;
    this.emit('publisher', { source: 'publisher', data: pub });
    return pub;
  }

  async publish(
    destination: string | string[],
    content: string | object | Buffer,
    options?: Options.Publish
  ): Promise<Channel> {
    const publisher = await this.publisher();
    return await publisher.publish(destination, content, options);
  }

  async sendToQueue(queue: string, content: string | object | Buffer, options?: Options.Publish): Promise<Channel> {
    const publisher = await this.publisher();
    return await publisher.publish(queue, content, options);
  }

  async prefetch(n: number): Promise<Replies.Empty> {
    return (await this.channel()).prefetch(n);
  }

  async close(): Promise<void> {
    const cn = this[$connection];
    if (cn) {
      const {
        channels: { confirming, normal },
      } = this;
      if (this[$publisher]) {
        this[$publisher].close();
      }
      if (confirming) {
        confirming.close();
      }
      if (normal) {
        normal.close();
      }
      await cn.close();
      this.emit('close', { source: 'self' });
    }
  }
}

export type BrokerOp<T> = (broker: Broker) => Promise<T>;
