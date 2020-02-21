import * as assert from 'assert-plus';
import * as dbg from 'debug';
import { Pipeline } from 'middles';
import { Options, Channel, ConfirmChannel } from 'amqplib';
import { EventEmitter } from 'events';

import { parseDestinations } from './util';
import { PublisherOptions, ChannelProvider } from './common';
import { PublishOp, PublisherMiddleware } from './publisher-middleware';
import { makeErrorPropagation, Cleanup, makeCleanupPropagation, addCleanupTask, iid } from './cleanup';

const debug = dbg('fiver:publisher');

const $channel = Symbol('channel');

export class PublisherImpl<C> extends EventEmitter {
  private [$channel]: Channel;
  private options: PublisherOptions;
  private middleware: Pipeline<PublishOp>;
  public provider: ChannelProvider;

  constructor(provider: ChannelProvider, options?: PublisherOptions) {
    super();
    this.provider = provider;
    this.options = options || { useDefaultMiddleware: true };
    const middleware = new Pipeline<PublishOp>();
    this.middleware = this.options.useDefaultMiddleware ? middleware.add(PublisherMiddleware.default) : middleware;
    this.on('close', ({ source }) => {
      if (source === 'self') {
        debug(`Publisher ${iid(this)} closed`);
      }
    });
    debug(`constructed Publisher ${iid(this)}`);
  }

  async channel(): Promise<Channel> {
    if (!this[$channel]) {
      const ch = await this.provider.channel(this.options.publisherConfirms);
      const errHandler = makeErrorPropagation('connection', (ch as unknown) as Cleanup, this);
      const closeHandler = makeCleanupPropagation('connection', 'close', (ch as unknown) as Cleanup, this);
      ch.on('error', errHandler);
      ch.once('close', closeHandler);
      addCleanupTask((ch as unknown) as Cleanup, () => {
        if (this[$channel]) {
          debug(`Publisher ${iid(this)} cleaned up channel ${iid(this[$channel])}`);
          this[$channel] = null;
        }
      });
      this[$channel] = ch;
      debug(`Publisher ${iid(this)} using channel ${iid(this[$channel])}`);
    }
    return this[$channel];
  }

  async publish(
    destination: string | string[],
    content: string | object | Buffer,
    options?: Options.Publish
  ): Promise<Channel> {
    assert.optionalObject(options, 'options');
    const op = await this.middleware.push<PublishOp>({
      destinations: parseDestinations(destination),
      content,
      options,
    });
    const ch = await this.channel();
    const len = op.destinations.length;
    let i = -1;
    while (++i < len) {
      const { exchange, routingKey } = op.destinations[i];
      if (!ch.publish(exchange, routingKey, op.content as Buffer, op.options)) {
        // Wait for the channel to emit a drain event...
        const drain: boolean[] = [];
        ch.once('drain', () => {
          drain.push(true);
        });
        await new Promise((resolve, reject) => {
          // double-check that we still need to wait; our promise setup may have
          // caused us to loose a race with the drain event.
          if (drain.length) resolve();
          const fail = (): void => {
            debug(`Publisher ${iid(this)}: channel ${iid(ch)} failed while waiting for drain`);
            reject(new Error('Channel closed while waiting for drain.'));
          };
          ch.once('close', fail);
          ch.once('drain', () => {
            resolve();
            ch.removeListener('close', fail);
          });
        });
      }
    }
    const { publisherConfirms, autoConfirm } = this.options;
    if (publisherConfirms && autoConfirm) {
      await (ch as ConfirmChannel).waitForConfirms();
    }
    return ch;
  }

  close(): void {
    if (this[$channel]) {
      this.emit('close', { source: 'self' });
    }
  }
}
