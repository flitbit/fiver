import assert from 'assert';
import { Broker, BrokerEvent, Message, MessageError, Consumer, BrokerOp, PublisherOp, PublisherOptions } from '.';

const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

describe('Publisher', () => {
  async function withBroker<T>(op: BrokerOp<T>): Promise<T> {
    const broker = new Broker(uri);
    try {
      return await op(broker);
    } finally {
      await broker.close();
    }
  }
  async function withPublisher<T>(
    broker: Broker,
    opOrOptions: PublisherOp<T> | PublisherOptions,
    op?: PublisherOp<T>
  ): Promise<T> {
    let options: PublisherOptions | undefined;
    if (typeof opOrOptions === 'object') {
      options = opOrOptions as PublisherOptions;
    } else {
      op = opOrOptions as PublisherOp<T>;
    }
    const publisher = broker.createPublisher(options);
    try {
      assert(op);
      return await op(publisher);
    } finally {
      await publisher.close();
    }
  }

  describe('broker.publisher(options?)', () => {
    it('succeeds when options undefined', () => {
      expect(async () => {
        withBroker(async (broker) => broker.createPublisher());
      }).not.toThrow();
    });
    it('succeeds when options specified', () => {
      expect(() => {
        withBroker(async (broker) => broker.createPublisher({ publisherConfirms: true }));
      }).not.toThrow();
    });
  });
  describe('.publish(destination, content, options?)', () => {
    it('causes JIT channel creation', async () => {
      await withBroker(async (broker) =>
        withPublisher(broker, async (publisher) => {
          const channels: string[] = [];
          broker.on('channel', (e: BrokerEvent) => {
            channels.push(e.source);
          });
          await publisher.publish('nobody', 'world!');
          expect(channels).toContain('channel');
        })
      );
    });
    it('sends what is published (string)', async () => {
      await withBroker(async (broker) =>
        withPublisher(broker, async (publisher) => {
          const q = await broker.assertQueue('', { autoDelete: true });
          const messages: string[] = [];
          const consumer = new Consumer(broker);
          try {
            consumer.on('message', (msg: Message) => {
              const m = `Hello ${msg.content}`;
              messages.push(m);
            });
            await consumer.consume(q.queue);
            await publisher.publish(q.queue, 'world!');
            await new Promise<void>((resolve) => {
              const h: NodeJS.Timeout[] = [];
              h.push(
                setInterval(() => {
                  if (messages.length) {
                    clearInterval(h[0]);
                    resolve();
                  }
                }, 100)
              );
            });
          } finally {
            await consumer.close();
          }
          expect(messages[0]).toContain('Hello world!');
        })
      );
    });
    it('sends what is published (string)', async () => {
      await withBroker(async (broker) =>
        withPublisher(broker, { useDefaultMiddleware: true }, async (publisher) => {
          const q = await broker.assertQueue('', { autoDelete: true });
          const messages: string[] = [];
          const consumer = new Consumer(broker, { useDefaultMiddleware: true });
          try {
            consumer.on('message-error', (e: MessageError) => {
              console.log(`Unexpected message-error: ${e.error}`);
            });
            consumer.on('message', (msg: Message) => {
              const m = `Hello ${msg.content}`;
              messages.push(m);
            });
            await consumer.consume(q.queue);
            await publisher.publish(q.queue, 'world!');
            await new Promise<void>((resolve) => {
              const h: NodeJS.Timeout[] = [];
              h.push(
                setInterval(() => {
                  if (messages.length) {
                    clearInterval(h[0]);
                    resolve();
                  }
                }, 100)
              );
            });
          } finally {
            await consumer.close();
          }
          expect(messages[0]).toContain('Hello world!');
        })
      );
    });
    it('sends what is published (object)', async () => {
      await withBroker(async (broker) =>
        withPublisher(broker, { useDefaultMiddleware: true }, async (publisher) => {
          const q = await broker.assertQueue('', { autoDelete: true });
          const messages: string[] = [];
          const consumer = new Consumer(broker, { useDefaultMiddleware: true });
          try {
            consumer.on('message-error', (e: MessageError) => {
              console.log(`Unexpected message-error: ${e.error}`);
            });
            consumer.on('message', (msg: Message) => {
              const m = `${msg.content.greeting} world!`;
              messages.push(m);
            });
            await consumer.consume(q.queue);
            await publisher.publish(q.queue, { greeting: 'Hello' });
            await new Promise<void>((resolve) => {
              const h: NodeJS.Timeout[] = [];
              h.push(
                setInterval(() => {
                  if (messages.length) {
                    clearInterval(h[0]);
                    resolve();
                  }
                }, 100)
              );
            });
          } finally {
            await consumer.close();
          }
          expect(messages[0]).toContain('Hello world!');
        })
      );
    });
    it('sends encoded as published (gzip)', async () => {
      await withBroker(async (broker) =>
        withPublisher(
          broker,
          { useDefaultMiddleware: true, publisherConfirms: true, autoConfirm: true },
          async (publisher) => {
            const q = await broker.assertQueue('', { autoDelete: true });
            const messages: string[] = [];
            const consumer = new Consumer(broker, { useDefaultMiddleware: true });
            try {
              consumer.on('message-error', (e: MessageError) => {
                console.log(`Unexpected message-error: ${e.error}`);
              });
              consumer.on('message', (msg: Message) => {
                const m = `${msg.content.greeting} world!`;
                messages.push(m);
              });
              await consumer.consume(q.queue);
              await publisher.publish(q.queue, { greeting: 'Hello' }, { contentEncoding: 'gzip,deflate' });
              await new Promise<void>((resolve) => {
                const h: NodeJS.Timeout[] = [];
                h.push(
                  setInterval(() => {
                    if (messages.length) {
                      clearInterval(h[0]);
                      resolve();
                    }
                  }, 100)
                );
              });
            } finally {
              await consumer.close();
            }
            expect(messages[0]).toContain('Hello world!');
          }
        )
      );
    });
  });
});
