import * as assert from 'assert-plus';

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
