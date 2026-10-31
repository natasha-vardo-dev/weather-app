import { LANGUAGES, type Language } from '../../i18n';

/** Each language in its own script ("Deutsch", "日本語"), so people can find theirs in any UI language. */
function nativeName(language: Language): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
  } catch {
    return language;
  }
}

/** The native names, in the order of LANGUAGES. */
export const NAMES = LANGUAGES.map(nativeName);
