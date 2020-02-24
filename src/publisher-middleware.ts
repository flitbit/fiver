import { gzipSync, deflateSync } from 'zlib';

import { crc32 } from 'crc';
import { PublishOp } from './common';

type M = (op: PublishOp) => Promise<PublishOp> | PublishOp;

export class PublisherMiddleware {
  static get default(): M[] {
    return [
      PublisherMiddleware.publisherEncodeString,
      PublisherMiddleware.publisherEncodeObject,
      PublisherMiddleware.publisherContentEncoding,
      PublisherMiddleware.publisherCrc32,
    ];
  }

  static publisherEncodeString(op: PublishOp): PublishOp {
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

  static publisherEncodeObject(op: PublishOp): PublishOp {
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

  static publisherContentEncoding(op: PublishOp): PublishOp {
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

  static publisherCrc32(op: PublishOp): PublishOp {
    const { destinations, content, options } = op;
    if (Buffer.isBuffer(content)) {
      if (!options.headers) {
        options.headers = {};
      }
      options.headers['x-crc32'] = crc32(content as Buffer).toString();
    }
    return {
      destinations,
      content,
      options,
    };
  }
}
