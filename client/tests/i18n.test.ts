import { describe, expect, it } from 'vitest';
import { degreeFormatter, LANGUAGES, messagesFor, numberFormatter } from '../src/i18n';
import { pluralize } from '../src/i18n/plural';

describe('pluralize', () => {
  it('uses the language plural rules', () => {
    const forms = { one: '{n} час', few: '{n} часа', many: '{n} часов', other: '{n} часа' };
    const ru = pluralize('ru');
    expect(ru(1, forms)).toBe('1 час');
    expect(ru(3, forms)).toBe('3 часа');
    expect(ru(10, forms)).toBe('10 часов');
    expect(ru(21, forms)).toBe('21 час');
  });

  it('falls back to "other" when a form is missing', () => {
    expect(pluralize('ar')(2, { one: 'one', other: '{n} other' })).toBe('2 other');
  });
});

describe('translations', () => {
  // The Messages type already makes a missing key a compile error; this catches empty values.
  it.each(LANGUAGES)('%s has a non-empty text for every message', (language) => {
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'function') {
        const text = value(10, 3);
        expect(typeof text, path).toBe('string');
        expect(text.trim(), path).not.toBe('');
      } else if (typeof value === 'string') {
        expect(value.trim(), path).not.toBe('');
      } else {
        for (const [key, child] of Object.entries(value as object)) walk(child, `${path}.${key}`);
      }
    };
    walk(messagesFor(language, language).t, language);
  });

  it('uses the right Russian forms in the forecast titles', () => {
    expect(messagesFor('ru', 'ru').t.daily.title(10)).toBe('Ближайшие 10 дней');
    expect(messagesFor('ru', 'ru').t.hourly.title(24)).toBe('Ближайшие 24 часа');
    expect(messagesFor('pl', 'pl').t.hourly.title(24)).toBe('Najbliższe 24 godziny');
  });
});

describe('numbers', () => {
  it('uses one digit system per locale, including inside translated texts', () => {
    // No right-to-left language is bundled now, but the formatters still handle one.
    const egypt = numberFormatter('ar-EG');
    expect(egypt(14)).toBe('١٤');
    // A temperature is wrapped in a left-to-right isolate so the sign stays after the number.
    expect(degreeFormatter('ar-EG', egypt)(13)).toBe('\u2066١٣°\u2069');
    // Texts get the locale's digits too: messagesFor passes the locale's formatter to plurals.
    expect(messagesFor('en', 'ar-EG').t.hourly.title(24)).toContain('٢٤');
    // Plain "ar" uses Latin digits in current CLDR, so nothing changes there.
    expect(numberFormatter('ar')(14)).toBe('14');
    // Left-to-right languages get no invisible characters.
    expect(messagesFor('en', 'en-GB').deg(13)).toBe('13°');
  });

  it('never shows "-0"', () => {
    expect(numberFormatter('en')(Math.round(-0.4))).toBe('0');
    expect(numberFormatter('en')(-3)).toBe('-3');
  });
});
