import { describe, expect, it } from 'vitest';
import { everyTopic, parseArgs, testPushData } from '../scripts/sendTestPush.js';

describe('test push script', () => {
  it('builds a message the service worker titles "Test warning", expiring in an hour', () => {
    const now = Date.UTC(2030, 0, 1, 12);
    const data = testPushData(now, ['PL1465']);
    expect(data).toMatchObject({
      key: `test-${now}`,
      onset: '2030-01-01T12:00:00.000Z',
      expires: '2030-01-01T13:00:00.000Z',
      areas: '["PL1465"]',
    });
    expect(JSON.parse(data.texts!)).toEqual({ en: expect.objectContaining({ event: 'Test warning' }) });
    // FCM data values must be strings.
    expect(Object.values(data).every((value) => typeof value === 'string')).toBe(true);
  });

  it('reaches every kind and minimum level a device of the area can be subscribed to', () => {
    expect(everyTopic(['PL1465'])).toEqual([
      'PL1465.storm.yellow',
      'PL1465.storm.orange',
      'PL1465.storm.red',
      'PL1465.all.yellow',
      'PL1465.all.orange',
      'PL1465.all.red',
    ]);
  });

  it('reads a device token, or a place with its flags', () => {
    expect(parseArgs(['--token', 'abc'])).toEqual({ token: 'abc' });
    expect(parseArgs(['52.23', '21.01', '--everyone'])).toEqual({
      latitude: 52.23,
      longitude: 21.01,
      dryRun: false,
      everyone: true,
    });
    expect(parseArgs(['-33.9', '151.2', '--dry-run'])).toMatchObject({
      latitude: -33.9,
      dryRun: true,
      everyone: false,
    });
  });

  it.each([[[]], [['--token']], [['--token', '--everyone']], [['91', '0']], [['abc', '1']]])('refuses %j', (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});
