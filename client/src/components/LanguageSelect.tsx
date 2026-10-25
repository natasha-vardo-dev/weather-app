import { LANGUAGES, type Language } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { Dropdown } from './Dropdown';

/** Each language in its own script ("Deutsch", "日本語"), so people can find theirs in any UI language. */
function nativeName(language: Language): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
  } catch {
    return language;
  }
}

// In the order of LANGUAGES; each name is in its own language, hence `lang` on every option.
const OPTIONS = LANGUAGES.map((code) => ({ value: code, label: nativeName(code), lang: code }));

export function LanguageSelect() {
  const { language, setLanguage, t } = useI18n();
  return <Dropdown label={t.language} value={language} options={OPTIONS} onChange={setLanguage} variant="language" />;
}
