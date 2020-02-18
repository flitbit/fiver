import * as assert from 'assert-plus';
import { EventEmitter } from 'events';
import { connect, Connection, Options, ConfirmChannel, Channel } from 'amqplib';
import { PublisherOptions, ChannelProvider, BrokerOptions } from './common';
import { Publisher } from './publisher';

interface Channels {
  normal?: Channel;
  confirming?: ConfirmChannel;
}

const $connection = Symbol('connection');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type E = (e: any) => void;

function makeErrorPropagation(source: string, target: EventEmitter): E {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error: any): void => {
    target.emit('error', {
      source,
      error,
    });
  };
}

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
  }

  async connect(): Promise<Connection> {
    if (this[$connection]) {
      return this[$connection];
    }
    const { uriOrOptions, socketOptions } = this;
    const cn = await connect(uriOrOptions, socketOptions);
    this[$connection] = cn;
    const errHandler = makeErrorPropagation('connection', this);
    cn.on('error', errHandler);
    cn.on('close', () => {
      this[$connection] = null;
      this.emit('close', {
        source: 'connection',
      });
    });
    this.emit('connect', { source: 'connection', data: cn });
    return cn;
  }

  async channel(publisherConfirms?: boolean): Promise<Channel> {
    const { channels } = this;
    if (publisherConfirms) {
      if (channels.confirming) {
        return channels.confirming;
      }
      const cn = await this.connect();
      const ch = await cn.createConfirmChannel();
      const errHandler = makeErrorPropagation('confirmChannel', this);
      ch.on('error', errHandler);
      ch.once('close', () => {
        this.channels.confirming = null;
        this.emit('close', {
          source: 'confirmChannel',
        });
        ch.removeListener('error', errHandler);
      });
      this.emit('channel', { source: 'confirmChannel', data: ch });
      return (channels.confirming = ch);
    }
    if (channels.normal) {
      return channels.normal;
    }
    const cn = await this.connect();
    const ch = await cn.createChannel();
    const errHandler = makeErrorPropagation('channel', this);
    ch.on('error', errHandler);
    ch.once('close', () => {
      channels.normal = null;
      this.emit('close', {
        source: 'channel',
      });
      ch.removeListener('error', errHandler);
    });
    this.emit('channel', { source: 'channel', data: ch });
    return (channels.normal = ch);
  }

  createPublisher(options?: PublisherOptions): Publisher {
    return new Publisher(this, options);
  }

  async close(): Promise<void> {
    if (this[$connection]) {
      const { channels } = this;
      if (channels) {
        if (channels.confirming) {
          await channels.confirming.close();
        }
        if (channels.normal) {
          await channels.normal.close();
        }
      }
      await this[$connection].close();
    }
  }
}
