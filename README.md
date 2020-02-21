# fiver &middot; [![Build Status](https://img.shields.io/travis/npm/npm/latest.svg?style=flat-square)](https://travis-ci.org/npm/npm) [![npm](https://img.shields.io/npm/v/npm.svg?style=flat-square)](https://www.npmjs.com/package/npm) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com) [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/your/your-project/blob/master/LICENSE)
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

### Consumer

Many applications need to consume messages; we have a `Consumer` or that.

```ts
import { Broker } from 'fiver';
export const broker = new Broker(process.env.AMQP_URI);
export const publisher = broker.createPublisher();

publisher.publish('daqueue', 'Hello World!')
  .catch(err => console.log(`Oops!: ${err}`));
```

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

## Api Reference





## Licensing

This project is licensed by the MIT license found in this repository's root.
