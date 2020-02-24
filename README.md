# fiver &middot; [![npm](https://img.shields.io/npm/v/npm.svg?style=flat-square)](https://www.npmjs.com/package/npm) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com) [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/flitbit/fiver/blob/master/LICENSE)
> A runt of a RabbitMQ client

**fiver** is a small, opinionated, RabbitMQ client for Nodejs that overlays my preferred AMQP patterns on the ubiquitous [amqplib](http://www.squaremobius.net/amqp.node/channel_api.html#overview).

I hope you find it useful.

## Installing / Getting started

**fiver** is installed using npm:

```shell
npm install -S fiver
```

In the above command we install **fiver** into the local project, updating the dependencies in the `project.json` file.

## Use

### Broker

RabbitMQ itself if a message broker, therefore, our main class is a `Broker`. Brokers are intended to live the life of your application.

```ts
import { Broker } from 'fiver';
export const broker = new Broker(process.env.AMQP_URI);
```

In the above commands, we import the `Broker` class and instantiate an instance using a URI provided in an environment variable.

### Publisher

Many applications need to publish messages; we have a `Publisher` class for that.

```ts
import { Broker } from 'fiver';
export const broker = new Broker(process.env.AMQP_URI);
export const publisher = broker.createPublisher();

publisher.publish('daqueue', 'Hello World!')
  .catch(err => console.log(`Oops!: ${err}`));
```

In the above command we create a publisher and send a message to a queue.

> We recommend that you create a dedicated publisher for your application instead of using the broker's `publish` convenience method.

```ts
import { Broker } from '../dist'; // 'fiver';
import { delay, awaitShutdown, blockUntilCount } from './util';
import { EOL } from 'os';

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient = {
  durable: false,
  autoDelete: true,
};

const exchange = 'tasks';
const message = 'Work task';

let count = 0;

const sender = async (): Promise<void> => {
  const broker = new Broker(uri);
  try {
    await broker.assertExchange(exchange, 'fanout', transient);

    // write tasks in the background until shutdown
    const shuttingDown: boolean[] = [];
    Promise.resolve()
      .then(async () => {
        const publisher = broker.createPublisher({ publisherConfirms: true, autoConfirm: true });
        try {
          while (shuttingDown.length == 0) {
            await publisher.publish(`${exchange}:`, `${message} ${++count}`);
            process.stdout.write(`\rtask ${count}`);
            // simulate other work with a random wait...
            await delay(Math.floor(Math.random() * Math.floor(500)));
          }
        } finally {
          await publisher.close();
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
```

In the above script \[[examples/producer.ts](https://github.com/flitbit/fiver/blob/master/examples/producer.ts)\], in the background process, we create a separate `Publisher` class using the `Broker`'s `.createPublisher(publisherOptions?)` method. Then we repeatedly publish messages until the program is interrupted.

The [examples/producer.ts](https://github.com/flitbit/fiver/blob/master/examples/producer.ts) script is intended to be run along side one or more [examples/consumer.ts](https://github.com/flitbit/fiver/blob/master/examples/consumer.ts) scripts.

If you've cloned this repository you can run the producer with the following commands in a bash shell:

```bash
npm install
npm run build
./node_modules/.bin/ts-node examples/publisher.ts
```

### Consumer

Many applications need to consume messages; we have a `Consumer` or that.

```ts
import { Broker, Consumer, Message } from '../dist'; // 'fiver';
import { awaitShutdown, delay } from './util';

// You need an instance of RabbitMQ running somewhere, look at this project's
// docker-compose.yml if you want to run one locally for testing.
const uri = process.env.AMQP_URI || 'amqp://guest:guest@localhost:5672/';

const transient = {
  durable: false,
  autoDelete: true,
};

const exchange = 'tasks';

const receiver = async (): Promise<void> => {
  const broker = new Broker(uri);
  try {
    await broker.assertExchange(exchange, 'fanout', transient);
    const q = await broker.assertQueue('', Object.assign({ exclusive: true }, transient));

    await broker.bindQueue(q.queue, exchange, '');
    await broker.prefetch(1);

    const consumer = new Consumer(broker);
    try {
      consumer.on(
        'message',
        async (m: Message): Promise<void> => {
          console.log(`message: ${m.content}`);
          // simulate that the business logic takes time.
          await delay(Math.floor(Math.random() * Math.floor(1000)));
          m.ack();
        }
      );

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
  .catch(e => console.error(`An unexpected error occurred: ${e.stack || e}`));
```

In the above script \[[examples/consumer.ts](https://github.com/flitbit/fiver/blob/master/examples/consumer.ts)\], we create a separate `Consumer` and subscribe to the 'message' event. When messages arrive we print them on the console, then simulate some work with a random delay before acknowledging the message.

The [examples/consumer.ts](https://github.com/flitbit/fiver/blob/master/examples/consumer.ts) script is intended to be run along side the [examples/publisher.ts](https://github.com/flitbit/fiver/blob/master/examples/publisher.ts) script.

If you've cloned this repository you can run the consumer with following commands in a bash shell:

```bash
npm install
npm run build
./node_modules/.bin/ts-node examples/consumer.ts
```

### Message

Messages are the whole point of AMQP and Rabbit MQ. **fiver** wraps all incoming messages in a convenient `Message` class enabling messages to be handed off to message handlers that aren't coupled with the rest of the AMQP plumbing.

* `.ack(allUpTo?)` &middot; acknowledges the message
* `.nack(allUpTo?, requeue?)` &middot; nacks the message (negative acknowledgement)
* `.reject(requeue?)` &middot; rejects the message

## Tests

Tests are built using [Mocha](https://mochajs.org/) and require a RabbitMQ connection string. If you've got [docker-compose](https://docs.docker.com/compose/) installed (and port 5672 available) you can follow these commands to run the tests:

```shell
npm run devup
npm test
```

In the above command, the `npm run devup` script uses **docker-compose** to stand up an instance of RabbitMQ in a **docker** container bound to your local port 5672. This enables the `npm test` script to run using the test's defaults.

If you have an instance of RabbitMQ running somewhere else, set an `AMQP_URI` environment variable indicating where it is:

```shell
AMQP_URI=amqp://guest:password@my.server.test:5672/test npm test
```

In the above command we're setting the `AMQP_URI` environment variable for our tests.

## Licensing

This project is licensed by the MIT license found in this repository's root.
