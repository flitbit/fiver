import { parseDestinations } from './util';

describe('util', () => {
  describe('parseDestinations(destination)', () => {
    it('throws when destination undefined', () => {
      expect(() => {
        parseDestinations(undefined as unknown as string);
      }).toThrow('destination (string | string[]) is required');
    });
    it('throws when destination is null', () => {
      expect(() => {
        parseDestinations(null as unknown as string);
      }).toThrow('destination (string | string[]) is required');
    });
    it('succeeds when destination is string (queue name)', () => {
      const destinations = parseDestinations('wargs');
      expect(destinations.length).toEqual(1);
      expect(destinations[0].exchange).toEqual('');
      expect(destinations[0].routingKey).toEqual('wargs');
    });
    const tests = [
      {
        title: 'destination (string) only (queue)',
        dest: 'wargs',
        expected: [':wargs'],
      },
      {
        title: 'destination (string) only (exchange)',
        dest: 'tasks:',
        expected: ['tasks:'],
      },
      {
        title: 'destination (string) (exchange:routingKey)',
        dest: 'peeps:wilbur',
        expected: ['peeps:wilbur'],
      },
      {
        title: 'destination (string) has extra spaces (exchange :routingKey)',
        dest: 'peeps :broadface',
        expected: ['peeps:broadface'],
      },
      {
        title: 'destination (string) has extra spaces (exchange: routingKey)',
        dest: 'peeps: broadface',
        expected: ['peeps:broadface'],
      },
      {
        title: 'destination (string) has extra spaces ( exchange : routingKey )',
        dest: ' peeps : broadface ',
        expected: ['peeps:broadface'],
      },
      {
        title: 'destination (string) has extra delimiter (exchange:routingKey;)',
        dest: 'peeps:broadface;',
        expected: ['peeps:broadface'],
      },
      {
        title: 'destination (string) has extra delimiter (;exchange:routingKey)',
        dest: 'peeps:broadface;',
        expected: ['peeps:broadface'],
      },
      {
        title: 'destination (string) has multiple keys (exchange:routingKey0,routingKey1)',
        dest: 'peeps:broadface,wilbur',
        expected: ['peeps:broadface', 'peeps:wilbur'],
      },
      {
        title: 'destination (string) has multiple keys (exchange0:routingKey0;exchange1:routingKey1)',
        dest: 'peeps:broadface;ducks:broadbill',
        expected: ['peeps:broadface', 'ducks:broadbill'],
      },
      {
        title: "destination (array) has multiple keys ['exchange0:routingKey0', 'exchange1:routingKey1']",
        dest: 'peeps:broadface;ducks:broadbill',
        expected: ['peeps:broadface', 'ducks:broadbill'],
      },
    ];
    for (const { title, dest, expected } of tests) {
      it(`succeeds when ${title}`, () => {
        const destinations = parseDestinations(dest).reduce((acc, { exchange, routingKey }) => {
          acc.push(`${exchange}:${routingKey}`);
          return acc;
        }, [] as string[]);
        expect(destinations.length).toEqual(expected.length);
        for (const item of expected) {
          expect(destinations).toContain(item);
        }
      });
    }
  });
});
