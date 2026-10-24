import { LANGUAGES, type Language } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';

/** Each language in its own script ("Deutsch", "日本語"), so people can find theirs in any UI language. */
function nativeName(language: Language): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
  } catch {
    return language;
  }
}

const OPTIONS = LANGUAGES.map((code) => ({ code, name: nativeName(code) }));

export function LanguageSelect() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language">
      <span className="visually-hidden">{t.language}</span>
      <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
        {OPTIONS.map(({ code, name }) => (
          // lang lets screen readers pronounce each name correctly.
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
