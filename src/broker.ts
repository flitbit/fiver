import * as assert from 'assert-plus';
import * as dbg from 'debug';
import { EventEmitter } from 'events';
import { connect, Connection, Options, ConfirmChannel, Channel, Replies } from 'amqplib';

import { PublisherOptions, ChannelProvider, BrokerOptions, Publisher } from './common';
import { PublisherImpl } from './publisher';
import { makeErrorPropagation, Cleanup, makeCleanupPropagation, addCleanupTask, iid } from './cleanup';

const debug = dbg('fiver:broker');

interface Channels {
  normal?: Channel;
  confirming?: ConfirmChannel;
}

export type ExchangeType = 'direct' | 'topic' | 'headers' | 'fanout';

const $connection = Symbol('connection');

export class Broker extends EventEmitter implements ChannelProvider {
  private [$connection]: Connection;
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
        debug(`Broker ${iid(this)} closed`);
      }
    });
    debug(`constructed Broker ${iid(this)}`);
  }

  async connect(): Promise<Connection> {
    if (this[$connection]) {
      return this[$connection];
    }
    const { uriOrOptions, socketOptions } = this;
    const cn = await connect(uriOrOptions, socketOptions);
    this[$connection] = cn;
    const errHandler = makeErrorPropagation('connection', (cn as unknown) as Cleanup, this);
    const closeHandler = makeCleanupPropagation('connection', 'close', (cn as unknown) as Cleanup, this);
    cn.on('error', errHandler);
    cn.once('close', closeHandler);
    addCleanupTask((cn as unknown) as Cleanup, () => {
      if (this[$connection] === cn) {
        debug(`Broker ${iid(this)} cleaned up connection ${iid(cn)}`);
        this[$connection] = null;
      }
    });
    debug(`Broker ${iid(this)} using connection ${iid(cn)}`);
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
    const errHandler = makeErrorPropagation('confirmChannel', (ch as unknown) as Cleanup, this);
    const closeHandler = makeCleanupPropagation('confirmChannel', 'close', (ch as unknown) as Cleanup, this);
    ch.on('error', errHandler);
    ch.once('close', closeHandler);
    addCleanupTask((ch as unknown) as Cleanup, () => {
      if (channels.confirming === ch) {
        debug(`Broker ${iid(this)} cleaned up confirmChannel ${iid(ch)}`);
        channels.confirming = null;
      }
    });
    this.emit('channel', { source: 'confirmChannel', data: ch });
    debug(`Broker ${iid(this)} using confirmChannel ${iid(ch)}`);
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
    const errHandler = makeErrorPropagation('channel', (ch as unknown) as Cleanup, this);
    const closeHandler = makeCleanupPropagation('channel', 'close', (ch as unknown) as Cleanup, this);
    ch.on('error', errHandler);
    ch.once('close', closeHandler);
    addCleanupTask((ch as unknown) as Cleanup, () => {
      if (channels.normal === ch) {
        debug(`Broker ${iid(this)} cleaned up channel ${iid(ch)}`);
        channels.normal = null;
      }
    });
    this.emit('channel', { source: 'channel', data: ch });
    debug(`Broker ${iid(this)} using channel ${iid(ch)}`);
    return (channels.normal = ch);
  }

  async assertQueue(name?: string, options?: Options.AssertQueue): Promise<Replies.AssertQueue> {
    const ch = await this.channel();
    return ch.assertQueue(name || '', options);
  }

  async checkQueue(name: string): Promise<Replies.AssertQueue> {
    const ch = await this.channel();
    return ch.checkQueue(name);
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

  createPublisher(options?: PublisherOptions): Publisher {
    return new PublisherImpl(this, options);
  }

  async close(): Promise<void> {
    const cn = this[$connection];
    if (cn) {
      const {
        channels: { confirming, normal },
      } = this;
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
