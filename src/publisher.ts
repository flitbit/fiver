import * as assert from 'assert-plus';
import * as dbg from 'debug';
import { Pipeline, Middleware } from 'middles';
import { Options, Channel, ConfirmChannel } from 'amqplib';
import { EventEmitter } from 'events';

import { parseDestinations } from './util';
import { PublisherOptions, ChannelProvider, Publisher, PublishOp } from './common';
import { PublisherMiddleware } from './publisher-middleware';
import { addCleanupTask, iid, cleanupPropagationEvent } from 'cleanup-util';

const debug = dbg('fiver:publisher');

const $channel = Symbol('channel');

export class PublisherImpl extends EventEmitter implements Publisher {
  private [$channel]: Channel;
  private options: PublisherOptions;
  private middleware: Pipeline<PublishOp>;
  public provider: ChannelProvider;

  constructor(provider: ChannelProvider, options?: PublisherOptions) {
    super();
    this.provider = provider;
    this.options = options || { useDefaultMiddleware: true };
    const middleware = new Pipeline<PublishOp>();
    this.middleware = this.options.useDefaultMiddleware
      ? middleware.add(PublisherMiddleware.default)
      : middleware.add(PublisherMiddleware.publisherEncodeString);
    this.on('close', ({ source }) => {
      if (source === 'self') {
        debug(`${iid(this)} closed`);
      }
    });
    debug(`new ${iid(this)}`);
  }

  add(middleware: Middleware<PublishOp>): Publisher {
    this.middleware.add(middleware);
    return this;
  }

  async channel(): Promise<Channel> {
    if (this[$channel]) {
      return this[$channel];
    }
    const ch = await this.provider.channel(this.options.publisherConfirms);
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
        debug(`Broker ${iid(this)} cleaned up ${iid(ch)}`);
        this[$channel] = null;
      }
      this.removeListener('error', errHandler);
    });
    debug(`${iid(this)} using ${iid(ch)}`);
    this[$channel] = ch;
    return ch;
  }

  async publish(
    destination: string | string[],
    content: string | object | Buffer,
    options?: Options.Publish
  ): Promise<Channel> {
    assert.optionalObject(options, 'options');
    const destinations = parseDestinations(destination);
    const op = await this.middleware.push<PublishOp>({
      destinations,
      content,
      options,
    });
    const ch = await this.channel();
    const len = op.destinations.length;
    let i = -1;
    while (++i < len) {
      const { exchange, routingKey } = op.destinations[i];
      if (!ch.publish(exchange, routingKey, op.content as Buffer, op.options || {})) {
        // Wait for the channel to emit a drain event...
        const drain: boolean[] = [];
        ch.once('drain', () => {
          drain.push(true);
        });
        debug(`${iid(this)} waiting for ${iid(ch)} to drain`);
        await new Promise((resolve, reject) => {
          // double-check that we still need to wait; our promise setup may have
          // caused us to loose a race with the drain event.
          if (drain.length) resolve();
          const fail = (): void => {
            debug(`${iid(this)}: ${iid(ch)} failed while waiting for drain`);
            reject(new Error(`${iid(ch)} closed while waiting for drain.`));
          };
          ch.once('close', fail);
          ch.once('drain', () => {
            resolve();
            ch.removeListener('close', fail);
            debug(`${iid(this)} received drain event from ${iid(ch)}`);
          });
        });
      }
    }
    const { publisherConfirms, autoConfirm } = this.options;
    if (i && publisherConfirms && autoConfirm) {
      debug(`${iid(this)} waiting for confirms`);
      await (ch as ConfirmChannel).waitForConfirms();
      debug(`${iid(this)} confirmed`);
    }
    return ch;
  }

  close(): void {
    if (this[$channel]) {
      this.emit('close', { source: 'self' });
    }
  }
}
