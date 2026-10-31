import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { silentLogger } from '../src/observability/logger.js';
import { WeatherService } from '../src/services/weatherService.js';
import { gracefulShutdown } from '../src/shutdown.js';
import { createFakeProvider } from './fakeProvider.js';

/**
 * A server with one slow route, released by the test. `arrived` resolves once the route has the
 * request: shutting down before that tests nothing (no connection is open yet, so the server
 * stops at once), and a fixed pause was sometimes too short under load.
 */
async function slowServer() {
  let release!: () => void;
  let arrive!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  const app = express();
  app.get('/slow', (_req, res) => {
    new Promise<void>((resolve) => (release = resolve)).then(() => res.send('done'));
    arrive();
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, url, arrived, release: () => release() };
}

describe('graceful shutdown', () => {
  it('lets a request under way finish, then stops and exits 0', async () => {
    const { server, url, arrived, release } = await slowServer();
    const exit = vi.fn();
    const shutdown = gracefulShutdown(server, { logger: silentLogger, exit });

    const answer = fetch(`${url}/slow`).then((r) => r.text());
    await arrived;
    shutdown('SIGTERM');
    shutdown('SIGTERM'); // a second signal changes nothing

    // New connections are refused while the old request is still open.
    await expect(fetch(`${url}/slow`)).rejects.toThrow();
    expect(exit).not.toHaveBeenCalled();
    release();
    expect(await answer).toBe('done');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });

  it('cuts requests still open after the timeout', async () => {
    const { server, url, arrived } = await slowServer();
    const exit = vi.fn();
    const answer = fetch(`${url}/slow`).then(
      () => 'answered',
      () => 'cut',
    );
    await arrived;
    gracefulShutdown(server, { logger: silentLogger, exit, timeoutMs: 50 })('SIGTERM');
    expect(await answer).toBe('cut');
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
  });

  it('answers health with 503 and closes connections while draining', async () => {
    let draining = false;
    const app = createApp(new WeatherService(createFakeProvider()), { draining: () => draining });
    const server = app.listen(0);
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
    draining = true;
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(503);
    expect(res.headers.get('connection')).toBe('close');
    server.close();
  });
});
