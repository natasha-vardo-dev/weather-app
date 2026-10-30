import { ar } from './locales/ar';
import { cs } from './locales/cs';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { he } from './locales/he';
import { hi } from './locales/hi';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { nl } from './locales/nl';
import { pl } from './locales/pl';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { sv } from './locales/sv';
import { tr } from './locales/tr';
import { uk } from './locales/uk';
import { zh } from './locales/zh';
import type { Messages, MessagesFactory } from './messages';
import { isRtl } from '@weather/shared';
import { pluralize } from './plural';

/**
 * All bundled translations (~2 KB gzip each). Bundled rather than lazy-loaded:
 * the whole set is small, and the first render never waits for a language file.
 */
export const MESSAGES = {
  en,
  de,
  fr,
  es,
  it,
  pt,
  nl,
  pl,
  cs,
  uk,
  ru,
  sv,
  tr,
  ar,
  he,
  hi,
  ja,
  ko,
  zh,
} satisfies Record<string, MessagesFactory>;

export type Language = keyof typeof MESSAGES;

export const LANGUAGES = Object.keys(MESSAGES) as Language[];

export const DEFAULT_LANGUAGE: Language = 'en';

/** Whole numbers in the locale's digits; "+ 0" turns -0 (Math.round(-0.4)) into 0, which Intl prints as "-0". */
export function numberFormatter(locale: string): (n: number) => string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return (n) => format.format(n + 0);
}

/**
 * "13°". In right-to-left text the degree sign has no direction of its own and, after
 * Arabic-Indic digits, drifts to the left ("°١٣"). An isolate (U+2066…U+2069) keeps
 * number and sign together as one left-to-right piece.
 */
export function degreeFormatter(locale: string, num: (n: number) => string): (n: number) => string {
  return isRtl(locale) ? (n) => `\u2066${num(n)}°\u2069` : (n) => `${num(n)}°`;
}

/** Texts for a language, with numbers in the digits of the full locale (ar-EG uses ١٤, ar uses 14). */
export function messagesFor(language: Language, locale: string) {
  const num = numberFormatter(locale);
  const deg = degreeFormatter(locale, num);
  return { t: MESSAGES[language]({ num, deg, plural: pluralize(locale, num) }), num, deg };
}

export type { Messages, MessagesFactory };
