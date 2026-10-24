import { describe, expect, it } from 'vitest';
import { baseLanguage, isRtl, matchLanguage } from '../src/language.js';

const supported = ['en', 'de', 'pt', 'ru'] as const;

describe('matchLanguage', () => {
  it('takes the first supported language, matching by base language', () => {
    expect(matchLanguage(['fi-FI', 'de-AT', 'en-US'], supported, 'en')).toBe('de');
    expect(matchLanguage(['pt-BR'], supported, 'en')).toBe('pt');
  });

  it('falls back when nothing matches', () => {
    expect(matchLanguage(['fi', 'sv'], supported, 'en')).toBe('en');
    expect(matchLanguage([], supported, 'en')).toBe('en');
  });
});

describe('language helpers', () => {
  it('reduces a tag to its base language', () => {
    expect(baseLanguage('zh-Hant-TW')).toBe('zh');
  });

  it('knows right-to-left languages', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he-IL')).toBe(true);
    expect(isRtl('ru')).toBe(false);
  });
});
