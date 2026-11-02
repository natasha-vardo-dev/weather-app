import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpenFromNotification } from '../../src/hooks/useOpenFromNotification';

/** A service worker container to send messages from, as the worker would. */
const container = Object.assign(new EventTarget(), { startMessages: vi.fn() });

beforeEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
});
afterEach(cleanup);

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
});
