import { describe, expect, it, vi } from 'vitest';
import {
  isSavedValue,
  isShowingSaved,
  markSavedResponse,
  SAVED_RESPONSE_HEADER,
  savedReason,
  showingSaved,
  showSaved,
  subscribeToSaved,
} from '../src/api/savedResponses';

const fromNetwork = () => new Response('{"a":1}');
const fromCache = () => new Response('{"a":1}', { headers: { [SAVED_RESPONSE_HEADER]: '1' } });

describe('markSavedResponse', () => {
  it('remembers the parsed body of a saved answer', async () => {
    const saved = await markSavedResponse(fromCache()).json();
    const fresh = await markSavedResponse(fromNetwork()).json();
    expect(saved).toEqual(fresh);
    expect(isSavedValue(saved)).toBe(true);
    expect(isSavedValue(fresh)).toBe(false);
    expect(isSavedValue(null)).toBe(false);
  });
});

describe('showSaved', () => {
  it('shows the warning while any saved value is on screen', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToSaved(onChange);

    const releaseForecast = showSaved();
    const releaseTile = showSaved();
    expect(isShowingSaved()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    releaseForecast();
    releaseForecast(); // a second release is ignored
    expect(isShowingSaved()).toBe(true);

    releaseTile();
    expect(isShowingSaved()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

describe('why a saved value is shown', () => {
  it('tells a copy used because the server failed from one used because the network did', async () => {
    const network = await markSavedResponse(fromCache()).json();
    const server = await markSavedResponse(
      new Response('{"a":1}', { headers: { [SAVED_RESPONSE_HEADER]: 'server' } }),
    ).json();
    expect(savedReason(network)).toBe('network');
    expect(savedReason(server)).toBe('server');
    expect(savedReason({})).toBeUndefined();
  });

  it('says offline when any saved value is there because of the network, else server', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToSaved(onChange);

    const releaseServer = showSaved('server');
    expect(showingSaved()).toBe('server');
    const releaseNetwork = showSaved('network');
    expect(showingSaved()).toBe('network');
    releaseNetwork();
    expect(showingSaved()).toBe('server');
    releaseServer();
    expect(showingSaved()).toBeNull();
    // Each change of what the banner says is announced, not only on and off.
    expect(onChange).toHaveBeenCalledTimes(4);
    unsubscribe();
  });
});
