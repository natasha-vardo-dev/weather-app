import { describe, expect, it, vi } from 'vitest';
import {
  isSavedValue,
  isShowingSaved,
  markSavedResponse,
  SAVED_RESPONSE_HEADER,
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
