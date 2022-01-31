/* eslint-disable @typescript-eslint/no-var-requires */
const { Broker, Consumer } = require('../');
const { blockUntilCount } = require('./util');

let count = 1;
const args = process.argv.slice(2);
if (args.length) {
  count = parseInt(args[0], 10);
}

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient = {
  durable: false,
  autoDelete: true,
};

const queue = 'hello';

const receiver = async () => {
  const broker = new Broker(uri);
  try {
    await broker.assertQueue(queue, transient);
    const consumer = new Consumer(broker);
    try {
      const messages = [];

      consumer.on('message-error', (m) => {
        console.log(`message-error: ${m.content}`);
        messages.push(m.content.toString()); // let the waiting process know we've received
      });

      consumer.on('message', (m) => {
        console.log(`message: ${m.content}`);
        messages.push(m.content.toString()); // let the waiting process know we've received
      });

      consumer.consume(queue, { noAck: true });

      await blockUntilCount(count, () => messages.length);
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
