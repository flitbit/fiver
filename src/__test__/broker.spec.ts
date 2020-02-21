import { expect } from 'chai';
import { Broker, BrokerEvent } from '..';
import { Options } from 'amqplib';

const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';
const invalidUri = 'amqp://guest:guest@localhost:9999/';
const amqpOptions: Options.Connect = {
  protocol: 'amqp',
  hostname: 'localhost',
  port: 5672,
  username: 'guest',
  password: 'guest',
};

describe('Broker', () => {
  describe('.ctor(uriOrOptions, options?)', () => {
    it('throws when uriOrOptions is undefined', () => {
      expect(() => {
        new Broker(undefined);
      }).to.throw('uriOrOptions (string | Options.Connect) is required');
    });
    it('throws when uriOrOptions is null', () => {
      expect(() => {
        new Broker(null);
      }).to.throw('uriOrOptions (string | Options.Connect) is required');
    });
    it('succeeds when uriOrOptions specified as string', () => {
      expect(() => {
        new Broker(uri);
      }).to.not.throw();
    });
    it('succeeds when uriOrOptions specified as Options.Connect', () => {
      expect(() => {
        new Broker(amqpOptions);
      }).to.not.throw();
    });
  });
  describe('.connect()', () => {
    it('connects', async () => {
      const broker = new Broker(uri);
      try {
        await broker.connect();
      } finally {
        await broker.close();
      }
    });
    it('propagates connect failure', async () => {
      const broker = new Broker(invalidUri);
      try {
        await broker.connect();
      } catch (e) {
        expect(e.message).to.eql('connect ECONNREFUSED 127.0.0.1:9999');
      } finally {
        await broker.close();
      }
    });
  });
  it('observes close events from connection', async () => {
    const observed = { close: false };
    const broker = new Broker(uri);
    try {
      broker.on('close', (ev: BrokerEvent): void => {
        console.log(`close event from ${ev.source}`);
        observed.close = true;
      });
      await broker.connect();
    } finally {
      await broker.close();
    }
    expect(observed.close).to.be.true;
  });
  it('observes close events from channel', async () => {
    const observed = { close: [''] };
    const broker = new Broker(uri);
    try {
      broker.on('close', (ev: BrokerEvent): void => {
        console.log(`close event from ${ev.source}`);
        observed.close.push(ev.source);
      });
      await broker.connect();
      await broker.channel();
    } finally {
      await broker.close();
    }
    expect(observed.close).to.contain('connection');
    expect(observed.close).to.contain('channel');
  });
  it('observes close events from confirm channel', async () => {
    const observed = { close: [''] };
    const broker = new Broker(uri);
    try {
      broker.on('close', (ev: BrokerEvent): void => {
        console.log(`close event from ${ev.source}`);
        observed.close.push(ev.source);
      });
      await broker.connect();
      await broker.confirmChannel();
    } finally {
      await broker.close();
    }
    expect(observed.close).to.contain('connection');
    expect(observed.close).to.contain('confirmChannel');
  });

  describe('.channel(publisherConfirms?)', () => {
    it('succeeds when publisherConfirms undefined', async () => {
      const broker = new Broker(uri);
      try {
        await broker.connect();
        await broker.channel();
      } finally {
        await broker.close();
      }
    });
    it('succeeds when publisherConfirms is true', async () => {
      const broker = new Broker(uri);
      try {
        await broker.connect();
        await broker.confirmChannel();
      } finally {
        await broker.close();
      }
    });
    it('succeeds when publisherConfirms is false', async () => {
      const broker = new Broker(uri);
      try {
        await broker.connect();
        await broker.channel();
      } finally {
        await broker.close();
      }
    });
  });
});
