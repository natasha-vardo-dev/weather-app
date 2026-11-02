import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpenFromNotification } from '../../src/hooks/useOpenFromNotification';
import { memoryIndexedDB } from '../memoryIndexedDB';

/** A service worker container to send messages from, as the worker would. */
const container = Object.assign(new EventTarget(), { startMessages: vi.fn() });

let db: ReturnType<typeof memoryIndexedDB>;
beforeEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
  db = memoryIndexedDB();
  vi.stubGlobal('indexedDB', db);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function send(data: unknown) {
  const channel = new MessageChannel();
  const answered = vi.fn();
  channel.port1.onmessage = answered;
  act(() => {
    container.dispatchEvent(new MessageEvent('message', { data, ports: [channel.port2] }));
  });
  return { answered, close: () => channel.port1.close() };
}

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/weather/252664-rhodes']}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      useOpenFromNotification();
      return useLocation().pathname;
    },
    { wrapper },
  );
}

describe('useOpenFromNotification', () => {
  it('opens the place the worker asks for and says so', async () => {
    const { result } = setup();
    expect(container.startMessages).toHaveBeenCalled();
    const message = send({ type: 'open-place', path: '/weather/756135-warsaw' });

    expect(result.current).toBe('/weather/756135-warsaw');
    await vi.waitFor(() => expect(message.answered).toHaveBeenCalled());
    message.close();
  });

  it("ignores other messages and paths that are not this site's", () => {
    const { result } = setup();
    for (const data of [
      { type: 'something-else', path: '/weather/756135-warsaw' },
      { type: 'open-place', path: '//evil.example/x' },
      { type: 'open-place', path: 'https://evil.example/' },
      { type: 'open-place' },
      null,
    ]) {
      send(data).close();
    }
    expect(result.current).toBe('/weather/252664-rhodes');
  });

  it('opens the place the worker recorded when the page shows again, once', async () => {
    const { result } = setup();
    db.data.set('open', { path: '/weather/756135-warsaw', at: Date.now() });
    act(() => setVisibility('visible'));
    await vi.waitFor(() => expect(result.current).toBe('/weather/756135-warsaw'));
    expect(db.data.has('open')).toBe(false);
  });

  it('opens a recorded place when the page loads', async () => {
    db.data.set('open', { path: '/weather/756135-warsaw', at: Date.now() });
    const { result } = setup();
    await vi.waitFor(() => expect(result.current).toBe('/weather/756135-warsaw'));
  });

  it('removes the record when the message already opened the place', async () => {
    setup();
    await new Promise((resolve) => setTimeout(resolve, 10)); // the check on load is done
    db.data.set('open', { path: '/weather/756135-warsaw', at: Date.now() });
    send({ type: 'open-place', path: '/weather/756135-warsaw' }).close();
    await vi.waitFor(() => expect(db.data.has('open')).toBe(false));
  });

  // A window opened at the place (openWindow) also finds the record: another entry for the same
  // page would make Back seem to do nothing.
  it('stays put, adding no history entry, when the page is already at the recorded place', async () => {
    db.data.set('open', { path: '/weather/252664-rhodes', at: Date.now() });
    const { result } = renderHook(
      () => {
        useOpenFromNotification();
        return useLocation().key;
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <MemoryRouter initialEntries={['/weather/252664-rhodes']}>{children}</MemoryRouter>
        ),
      },
    );
    const key = result.current;
    await vi.waitFor(() => expect(db.data.has('open')).toBe(false));
    send({ type: 'open-place', path: '/weather/252664-rhodes' }).close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBe(key);
  });

  // navigate() changes with every pathname: as a dependency it subscribed everything again, and
  // read IndexedDB twice, on every move. (Found by roborev.)
  it('subscribes once, not again on every move', async () => {
    container.startMessages.mockClear();
    const open = vi.spyOn(db, 'open');
    const { result } = setup();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const opens = open.mock.calls.length;
    send({ type: 'open-place', path: '/weather/756135-warsaw' }).close();
    expect(result.current).toBe('/weather/756135-warsaw');
    send({ type: 'open-place', path: '/weather/3094802-krakow' }).close();
    expect(result.current).toBe('/weather/3094802-krakow');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.startMessages).toHaveBeenCalledTimes(1);
    // Only the message route's own clean-ups, one per message, no checks on moving.
    expect(open.mock.calls.length - opens).toBe(2);
  });
});
