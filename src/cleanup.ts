import * as dbg from 'debug';
import { EventEmitter } from 'events';

const debug = dbg('fiver:cleanup');

const $cleanup = Symbol('cleanup');
const $$ = Symbol('$');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type E = (e: any) => void;
export type W = () => void;

export interface Cleanup extends EventEmitter {
  [$cleanup]: W[];
}

let _id = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const iid = (o: any): string => {
  if (typeof o[$$] === 'undefined') {
    o[$$] = (++_id).toString(16);
  }
  return o[$$];
};

export function makeErrorPropagation(source: string, sender: Cleanup, target: EventEmitter): E {
  const h = (++_id).toString(16);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (error: any): void => {
    debug(`${source}-${iid(sender)}-${h}: error`);
    target.emit('error', {
      source,
      error,
    });
  };
  debug(`${source}-${iid(sender)}: adding error handler ${h}`);
  if (!sender[$cleanup]) {
    sender[$cleanup] = [];
  }
  sender[$cleanup].push(() => {
    debug(`${source}-${iid(sender)}: removing error handler ${h}`);
    sender.removeListener('error', res);
  });
  return res;
}

export function makeCleanupPropagation(source: string, event: string, sender: Cleanup, target: EventEmitter): W {
  const h = (++_id).toString(16);
  const cleanup = (): void => {
    if (sender[$cleanup]) {
      const len = sender[$cleanup].length;
      let i = len;
      while (--i > -1) {
        sender[$cleanup][i]();
      }
    }
    sender[$cleanup] = null;
  };
  debug(`${source}-${iid(sender)}: adding ${event} handler ${h}`);
  const res = (): void => {
    debug(`${source}-${iid(sender)}-${h}: ${event}`);
    target.emit(event, {
      source,
    });
    cleanup();
  };
  if (!sender[$cleanup]) {
    sender[$cleanup] = [];
  }
  const reciprocalClose = (): void => {
    setImmediate(cleanup);
    debug(`${source}-${iid(sender)}: received reciprocal close ${iid(target)}`);
  };
  target.once('close', reciprocalClose);
  sender[$cleanup].push(() => {
    debug(`${source}-${iid(sender)}: removing ${event} handler ${h}`);
    sender.removeListener(event, res);
    target.removeListener('close', reciprocalClose);
  });
  return res;
}

export function addCleanupTask(sender: Cleanup, task: W): void {
  if (!sender[$cleanup]) {
    sender[$cleanup] = [];
  }
  sender[$cleanup].push(task);
}
