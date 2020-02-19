import { expect } from 'chai';
import { Broker, BrokerEvent, BaseConsumer, Message, MessageError } from '..';

const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

describe('Publisher', () => {
  let broker: Broker;
  before(async () => {
    broker = new Broker(uri);
    broker.on('close', (ev: BrokerEvent): void => {
      console.log(`close event from ${ev.source}`);
    });
    broker.on('connect', (ev: BrokerEvent): void => {
      console.log(`connect event from ${ev.source}`);
    });
    await broker.connect();
  });
  after(async () => {
    if (broker) {
      await broker.close();
    }
  });
  describe('broker.publisher(options?)', () => {
    it('succeeds when options undefined', () => {
      expect(() => {
        broker.createPublisher();
      }).to.not.throw();
    });
    it('succeeds when options specified', () => {
      expect(() => {
        broker.createPublisher({ publisherConfirms: true });
      }).to.not.throw();
    });
  });
  describe('.publish(destination, content, options?)', () => {
    it('causes JIT channel creation', async () => {
      const publisher = broker.createPublisher();
      const channels: string[] = [];
      broker.on('channel', (e: BrokerEvent) => {
        channels.push(e.source);
      });
      await publisher.publish('nobody', 'world!');
      expect(channels).to.contain('channel');
    });
    it('sends what is published (string)', async () => {
      const publisher = broker.createPublisher();
      const ch = await broker.channel();
      const q = await ch.assertQueue('');
      const messages: string[] = [];
      const consumer = new BaseConsumer(publisher);
      consumer.on('message', (msg: Message) => {
        const m = `Hello ${msg.content}`;
        messages.push(m);
      });
      await consumer.consume(q.queue);
      await publisher.publish(q.queue, 'world!');
      await new Promise(resolve => {
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
      await consumer.cancel();
      expect(messages[0]).to.contain('Hello world!');
    });
    it('sends what is published (string)', async () => {
      const publisher = broker.createPublisher({ useDefaultMiddleware: true });
      const ch = await broker.channel();
      const q = await ch.assertQueue('');
      const messages: string[] = [];
      const consumer = new BaseConsumer(publisher, { useDefaultMiddleware: true });
      consumer.on('message-error', (e: MessageError) => {
        console.log(`Unexpected message-error: ${e.error}`);
      });
      consumer.on('message', (msg: Message) => {
        const m = `Hello ${msg.content}`;
        messages.push(m);
      });
      await consumer.consume(q.queue);
      await publisher.publish(q.queue, 'world!');
      await new Promise(resolve => {
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
      await consumer.cancel();
      expect(messages[0]).to.contain('Hello world!');
    });
    it('sends what is published (object)', async () => {
      const publisher = broker.createPublisher({ useDefaultMiddleware: true });
      const ch = await broker.channel();
      const q = await ch.assertQueue('');
      const messages: string[] = [];
      const consumer = new BaseConsumer(publisher, { useDefaultMiddleware: true });
      consumer.on('message-error', (e: MessageError) => {
        console.log(`Unexpected message-error: ${e.error}`);
      });
      consumer.on('message', (msg: Message) => {
        const m = `${msg.content.greeting} world!`;
        messages.push(m);
      });
      await consumer.consume(q.queue);
      await publisher.publish(q.queue, { greeting: 'Hello' });
      await new Promise(resolve => {
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
      await consumer.cancel();
      expect(messages[0]).to.contain('Hello world!');
    });
    it('sends encoded as published (gzip)', async () => {
      const publisher = broker.createPublisher({ useDefaultMiddleware: true });
      const ch = await broker.channel();
      const q = await ch.assertQueue('');
      const messages: string[] = [];
      const consumer = new BaseConsumer(publisher, { useDefaultMiddleware: true });
      consumer.on('message-error', (e: MessageError) => {
        console.log(`Unexpected message-error: ${e.error}`);
      });
      consumer.on('message', (msg: Message) => {
        const m = `${msg.content.greeting} world!`;
        messages.push(m);
      });
      await consumer.consume(q.queue);
      await publisher.publish(q.queue, { greeting: 'Hello' }, { contentEncoding: 'gzip,deflate' });
      await new Promise(resolve => {
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
      await consumer.cancel();
      expect(messages[0]).to.contain('Hello world!');
    });
  });
});
