/* eslint-disable @typescript-eslint/no-var-requires */
const { Broker, Consumer } = require('../'); // 'fiver';
const { awaitShutdown, delay } = require('./util');

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient = {
  durable: false,
  autoDelete: true,
};

const exchange = 'tasks';

const receiver = async () => {
  const broker = new Broker(uri);
  try {
    await broker.assertExchange(exchange, 'fanout', transient);
    const q = await broker.assertQueue('', Object.assign({ exclusive: true }, transient));

    await broker.bindQueue(q.queue, exchange, '');
    await broker.prefetch(1);

    const consumer = new Consumer(broker);
    try {
      consumer.on('message', async (m) => {
        console.log(`message: ${m.content}`);
        // simulate that the business logic takes time.
        await delay(Math.floor(Math.random() * Math.floor(1000)));
        m.ack();
      });

      consumer.consume(q.queue, { noAck: false });

      console.log('Receiving tasks, press CTRL+C to exit...');
      await awaitShutdown();
    } finally {
      await consumer.close();
    }
  } finally {
    await broker.close();
  }
};

Promise.resolve()
  .then(receiver)
  .catch((e) => console.error(`An unexpected error occurred: ${e.stack || e}`));
