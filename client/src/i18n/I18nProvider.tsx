import { baseLanguage, isRtl, matchLanguage } from '@weather/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGES, messagesFor, type Language, type Messages } from '.';

const STORAGE_KEY = 'language';

function systemLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** An explicit choice wins; otherwise the first system language we support; otherwise English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGUAGES as string[]).includes(saved)) return saved as Language;
  } catch {
    // Storage can be blocked (privacy mode): fall through to the system language.
  }
  return matchLanguage(systemLanguages(), LANGUAGES, DEFAULT_LANGUAGE);
}

/**
 * Locale for dates and numbers: the user's full system tag when it is the same language
 * (en-US gives "4:00 PM", en-GB "16:00"), otherwise just the chosen language.
 */
function localeFor(language: Language): string {
  return systemLanguages().find((tag) => baseLanguage(tag) === language) ?? language;
}

interface I18n {
  language: Language;
  locale: string;
  t: Messages;
  /** Whole number in the locale's digits: use for every number shown, so a screen never mixes 14 and ٨٨. */
  num: (value: number) => string;
  /** Temperature: "13°", kept together in right-to-left text. */
  deg: (value: number) => string;
  setLanguage: (language: Language) => void;
  /** 88 -> "88%" ("88 %" in French, "%88" in Turkish). */
  percent: (value: number) => string;
  /** Formats a speed with a localized unit when the browser knows it ("9 km/h", "9 км/ч"). */
  speed: (value: number, unit: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

const INTL_UNITS: Record<string, string> = {
  'km/h': 'kilometer-per-hour',
  'mp/h': 'mile-per-hour',
  'm/s': 'meter-per-second',
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved, but the choice still applies for this visit.
    }
  }, []);

  // Screen readers pick pronunciation from lang; dir flips the layout for Arabic and Hebrew.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
  }, [language]);

  const value = useMemo<I18n>(() => {
    const locale = localeFor(language);
    const { t, num, deg } = messagesFor(language, locale);
    const percentFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    return {
      language,
      locale,
      t,
      num,
      deg,
      setLanguage,
      percent: (n) => percentFormat.format(n / 100),
      speed: (n, unit) => {
        const intlUnit = INTL_UNITS[unit];
        if (!intlUnit) return `${Math.round(n)} ${unit}`;
        return new Intl.NumberFormat(locale, { style: 'unit', unit: intlUnit, maximumFractionDigits: 0 }).format(n);
      },
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error('useI18n must be used inside I18nProvider');
  return i18n;
}
