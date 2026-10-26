import { describe, expect, it } from 'vitest';
import { isIos, shouldShowInstallHint, type Platform } from '../src/installHint';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

const iphone: Platform = { userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: false };

describe('isIos', () => {
  it('recognises iPhone browsers, Safari or not', () => {
    expect(isIos(iphone)).toBe(true);
    expect(isIos({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 })).toBe(true);
  });

  it('tells an iPad posing as a Mac from a real Mac by touch', () => {
    expect(isIos({ userAgent: MAC_SAFARI, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
  });

  it('leaves Android out: Chrome offers installation itself', () => {
    expect(isIos({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('shouldShowInstallHint', () => {
  it('shows on iOS in the browser', () => {
    expect(shouldShowInstallHint(iphone, false)).toBe(true);
  });

  it('hides once installed or dismissed', () => {
    expect(shouldShowInstallHint({ ...iphone, standalone: true }, false)).toBe(false);
    expect(shouldShowInstallHint(iphone, true)).toBe(false);
  });
});
