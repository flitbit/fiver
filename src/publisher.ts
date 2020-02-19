import { PublisherOptions, ChannelProvider } from './common';
import { Pipeline } from 'middles';
import { parseDestinations } from './util';
import { Options, Channel } from 'amqplib';
import * as assert from 'assert-plus';
import { PublishOp, PublisherMiddleware } from './publisher-middleware';

export class Publisher {
  private options: PublisherOptions;
  private middleware: Pipeline<PublishOp>;
  public provider: ChannelProvider;

  constructor(provider: ChannelProvider, options?: PublisherOptions) {
    this.provider = provider;
    this.options = options || { useDefaultMiddleware: true };
    const middleware = new Pipeline<PublishOp>();
    this.middleware = this.options.useDefaultMiddleware ? middleware.add(PublisherMiddleware.default) : middleware;
  }

  async channel(): Promise<Channel> {
    return await this.provider.channel(this.options.publisherConfirms);
  }

  async publish(
    destination: string | string[],
    content: string | object | Buffer,
    options?: Options.Publish
  ): Promise<Channel> {
    assert.optionalObject(options, 'options');
    const { provider } = this;
    const op = await this.middleware.push<PublishOp>({
      destinations: parseDestinations(destination),
      content,
      options,
    });
    const ch = await provider.channel(this.options.publisherConfirms);
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
    return ch;
  }
}
