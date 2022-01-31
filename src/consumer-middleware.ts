import { gunzipSync, inflateSync } from 'zlib';
import { parse } from 'content-type';
import { crc32 } from 'crc';

import { Message } from './message';
import { AsyncProcessor } from 'middles';

export class ConsumerMiddleware {
  static get default(): AsyncProcessor<Message>[] {
    return [
      ConsumerMiddleware.consumerCrc32Check,
      ConsumerMiddleware.consumerContentDecoding,
      ConsumerMiddleware.consumerDecodeObject,
      ConsumerMiddleware.consumerDecodeString,
    ];
  }

  static async consumerCrc32Check(msg: Message): Promise<Message> {
    const {
      content,
      properties: { headers },
    } = msg;
    if (Buffer.isBuffer(content) && headers && headers['x-crc32']) {
      const crc = crc32(content).toString();
      if (crc !== headers['x-crc32']) {
        const error = `Calculated CRC doesn't match the message's header: got ${crc}, expected ${headers['x-crc32']}`;
        msg.middlewareLog('error', error);
        throw new Error(error);
      }
      msg.set('crc32', crc);
      msg.middlewareLog('debug', `Calculated CRC matches the messages header: ${crc}.`);
    }
    return msg;
  }

  static async consumerDecodeString(msg: Message): Promise<Message> {
    const {
      content,
      properties: { contentType },
    } = msg;
    if (Buffer.isBuffer(content) && contentType) {
      const decodedType = parse(contentType);
      if (decodedType.type.indexOf('text/') === 0) {
        // always attempt to decode text content.
        const charset = (decodedType.parameters.charset || 'utf-8') as unknown as BufferEncoding;
        return msg.overrideContent(content.toString(charset));
      }
    }
    return msg;
  }

  static async consumerDecodeObject(msg: Message): Promise<Message> {
    const {
      content,
      properties: { contentType },
      fields: { exchange, routingKey },
    } = msg;
    if (Buffer.isBuffer(content) && contentType) {
      const decodedType = parse(contentType);
      if (decodedType.type === 'application/json') {
        // always attempt to decode json content.
        const charset = (decodedType.parameters.charset || 'utf-8') as unknown as BufferEncoding;
        try {
          const obj = JSON.parse(content.toString(charset));
          msg.middlewareLog('debug', `transformed to object from ${contentType}`);
          return msg.overrideContent(obj);
        } catch (err) {
          const error = `${exchange}:${routingKey} unexpected error deserializing JSON data: ${err}`;
          msg.middlewareLog('error', error);
          return Promise.reject(new Error(error));
        }
      }
    }
    return msg;
  }

  static async consumerContentDecoding(msg: Message): Promise<Message> {
    const {
      content,
      properties,
      properties: { contentEncoding },
      fields,
      fields: { exchange, routingKey },
    } = msg;
    // only decode if we're dealing with a buffer. Otherwise the middleware may
    // be out of order.
    if (Buffer.isBuffer(content) && typeof contentEncoding !== 'undefined') {
      try {
        let overrideContent: Buffer = content;
        const encodings = contentEncoding.split(',');
        let i = encodings.length;
        while (--i > -1) {
          const encoding = encodings[i].trim();
          if (encoding === 'gzip') {
            overrideContent = gunzipSync(overrideContent);
            msg.middlewareLog('debug', `processed content encoding ${encoding}`);
          } else if (encoding === 'deflate') {
            overrideContent = inflateSync(overrideContent);
            msg.middlewareLog('debug', `processed content encoding ${encoding}`);
          } else if (encoding === 'identity') {
            // implicit, fall through
          } else {
            // revert to original content.
            msg.middlewareLog('debug', `${exchange}:${routingKey} unrecognized content encoding: ${encoding}`);
            return msg;
          }
        }
        return msg.overrideContent(overrideContent);
      } catch (err) {
        const e = `${exchange}:${routingKey} unexpected error decompressing message: ${JSON.stringify({
          properties,
          fields,
          content,
        })}`;
        msg.middlewareLog('error', e);
        return Promise.reject(e);
      }
    }
    return msg;
  }
}
