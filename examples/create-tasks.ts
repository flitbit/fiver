import { Broker } from '../dist';
import { Options } from 'amqplib';
import { delay, awaitShutdown, blockUntilCount } from './util';
import { EOL } from 'os';

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient: Options.AssertQueue = {
  durable: true,
  autoDelete: true,
};

const queue = 'workers';
const message = 'Work task';

let count = 0;

const sender = async (): Promise<void> => {
  const broker = new Broker(uri, { publisherOptions: { publisherConfirms: true, autoConfirm: true } });
  try {
    await broker.assertQueue(queue, transient);

    // write tasks in the background until shutdown
    const shuttingDown: boolean[] = [];
    Promise.resolve()
      .then(async () => {
        while (shuttingDown.length == 0) {
          await broker.sendToQueue(queue, `${message} ${++count}`);
          process.stdout.write(`\rtask ${count}`);
          // simulate other work with a random wait...
          await delay(Math.floor(Math.random() * Math.floor(500)));
        }
        console.log(EOL + 'done');
      })
      .then(() => shuttingDown.push(true));

    console.log('Sending tasks, press CTRL+C to exit...');
    await awaitShutdown();
    shuttingDown.push(true);
    blockUntilCount(2, () => shuttingDown.length);
  } finally {
    await broker.close();
  }
};

Promise.resolve()
  .then(sender)
  .catch(e => console.error(`An unexpected error occurred: ${e.stack || e}`));
