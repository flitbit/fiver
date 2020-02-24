import { expect } from 'chai';
import { parseDestinations } from '../util';

describe('util', () => {
  describe('parseDestinations(destination)', () => {
    it('throws when destination undefined', () => {
      expect(() => {
        parseDestinations(undefined);
      }).to.throw('destination (string | string[]) is required');
    });
    it('throws when destination is null', () => {
      expect(() => {
        parseDestinations(null);
      }).to.throw('destination (string | string[]) is required');
    });
    it('succeeds when destination is string (queue name)', () => {
      const destinations = parseDestinations('wargs');
      expect(destinations.length).to.eql(1);
      expect(destinations[0].exchange).to.eql('');
      expect(destinations[0].routingKey).to.eql('wargs');
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
        }, []);
        expect(destinations.length).to.eql(expected.length);
        for (const item of expected) {
          expect(destinations).to.contain(item);
        }
      });
    }
  });
});
