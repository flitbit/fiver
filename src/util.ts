import * as assert from 'assert-plus';
import { gzipSync, deflateSync } from 'zlib';
import { Options } from 'amqplib';

export interface Destination {
  exchange: string;
  routingKey: string;
}

function destinationsFromRoutingKeys(exchange: string, routingKeys: string, destinations: Destination[]): void {
  if (typeof exchange === 'string' && routingKeys) {
    const keys = routingKeys.split(',');
    const len = keys.length;
    let i = -1;
    while (++i < len) {
      destinations.push({
        exchange,
        routingKey: keys[i].trim(),
      });
    }
  }
}

export function parseDestinations(destination: string | string[]): Destination[] {
  if (typeof destination === 'string') {
    destination = [destination];
  }
  assert.ok(Array.isArray(destination), 'destination (string | string[]) is required');
  const results: Destination[] = [];
  const len = destination.length;
  let i = -1;
  while (++i < len) {
    const d = destination[i].split(';');
    const len1 = d.length;
    let j = -1;
    while (++j < len1) {
      const dd = d[j].split(':');
      if (dd.length > 1) {
        destinationsFromRoutingKeys(dd[0].trim(), dd[1], results);
      } else {
        destinationsFromRoutingKeys('', dd[0], results);
      }
    }
  }
  return results;
}

export interface PublishOp {
  destinations: Destination[];
  content: string | object | Buffer;
  options?: Options.Publish;
}

export function publisherEncodeString(op: PublishOp): PublishOp {
  let { content, options } = op;
  let contentType = options ? options.contentType : null;
  if (typeof content === 'string') {
    content = Buffer.from(content);
    contentType = 'text/plain';
  }
  if (contentType && (!options || options.contentType !== contentType)) {
    options = Object.assign({}, options, { contentType });
  }
  return {
    destinations: op.destinations,
    content,
    options,
  };
}

export function publisherEncodeObject(op: PublishOp): PublishOp {
  let { content, options } = op;
  if (typeof content === 'object' && !Buffer.isBuffer(content)) {
    content = Buffer.from(JSON.stringify(content));
    if (!options || options.contentType !== 'application/json') {
      options = Object.assign({}, options, { contentType: 'application/json' });
    }
  }
  return {
    destinations: op.destinations,
    content,
    options,
  };
}

export function publisherContentEncoding(op: PublishOp): PublishOp {
  const { destinations, options } = op;
  let content = op.content;
  const contentEncoding = options ? options.contentEncoding : null;
  if (contentEncoding && Buffer.isBuffer(content)) {
    const encodings = contentEncoding.split(',');
    for (let i = 0; i < encodings.length; ++i) {
      const encoding = encodings[i].trim();
      if (encoding === 'gzip') {
        content = gzipSync(content as Buffer);
      } else if (encoding === 'deflate') {
        content = deflateSync(content as Buffer);
      } else if (encoding === 'identity') {
        // nothing to see here. Pass it through.
      } else {
        throw new Error(`Unrecognized content encoding: ${encoding}`);
      }
    }
  }
  return {
    destinations,
    content,
    options,
  };
}
