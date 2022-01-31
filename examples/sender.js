/* eslint-disable @typescript-eslint/no-var-requires */
const { Broker } = require('../');
const { delay } = require('./util');

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient = {
  durable: false,
  autoDelete: true,
};

const queue = 'hello';
const message = 'Hello world';

const sender = async () => {
  // const broker = new Broker(uri, { publisherOptions: { publisherConfirms: true, autoConfirm: true } });
  const broker = new Broker(uri);
  try {
    await broker.assertQueue(queue, transient);
    await broker.sendToQueue(queue, message);
    await delay(100); // when not using publisherConfirms, enable this line to give the channel enough time.
  } finally {
    await broker.close();
  }
};

Promise.resolve()
  .then(sender)
  .catch((e) => console.error(`An unexpected error occurred: ${e.stack || e}`));
