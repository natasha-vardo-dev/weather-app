import { describe, expect, it } from 'vitest';
import { createErrorReporter, reportPath, type ClientErrorReport } from '../src/errorReporting';

function setup(path = '/') {
  const sent: ClientErrorReport[] = [];
  const report = createErrorReporter({ send: (r) => sent.push(r), path: () => path, release: 'abc1234', max: 3 });
  return { sent, report };
}

describe('error reporting', () => {
  it('sends the error, its stack and the components, with the build', () => {
    const { sent, report } = setup('/');
    const error = new TypeError("Cannot read properties of undefined (reading 'temperature')");
    report('render', error, '\n    at CurrentWeather');
    expect(sent).toEqual([
      {
        kind: 'render',
        message: "TypeError: Cannot read properties of undefined (reading 'temperature')",
        stack: error.stack,
        componentStack: '\n    at CurrentWeather',
        path: '/',
        release: 'abc1234',
      },
    ]);
  });

  it('never sends where the user is: places become a placeholder, and there is no query', () => {
    expect(reportPath('/weather/52.23,21.01')).toBe('/weather/:place');
    expect(reportPath('/weather/756135-warsaw')).toBe('/weather/:place');
    expect(reportPath('/')).toBe('/');
  });

  it('sends the same error once, and a few at most, so a page failing in a loop does not flood the log', () => {
    const { sent, report } = setup();
    for (let i = 0; i < 5; i += 1) report('error', new Error('same'));
    report('rejection', 'second');
    report('rejection', 'third');
    report('rejection', 'fourth');
    expect(sent.map((r) => r.message)).toEqual(['Error: same', 'second', 'third']);
  });

  it("ignores the browser's and extensions' noise", () => {
    const { sent, report } = setup();
    report('error', 'ResizeObserver loop completed with undelivered notifications.');
    const fromExtension = new Error('boom');
    fromExtension.stack = 'Error: boom\n    at chrome-extension://abc/content.js:1:1';
    report('error', fromExtension);
    expect(sent).toEqual([]);
  });

  it('cuts what is too long for the endpoint', () => {
    const { sent, report } = setup();
    const error = new Error('x'.repeat(600));
    error.stack = 'y'.repeat(5000);
    report('error', error, 'z'.repeat(3000));
    expect(sent[0]!.message).toHaveLength(500);
    expect(sent[0]!.stack).toHaveLength(4000);
    expect(sent[0]!.componentStack).toHaveLength(2000);
  });
});
