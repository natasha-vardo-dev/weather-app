import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  currentPlatform,
  dismissInstallHint,
  isInstallHintDismissed,
  shouldShowInstallHint,
} from '../installHint';

/** The iOS Share icon (a box with an arrow up), so the step points at what to look for. */
function ShareIcon() {
  return (
    <svg className="install-hint__share" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11M8 6.5L12 3l4 3.5M8.5 10H6.5v10.5h11V10h-2" />
    </svg>
  );
}

/**
 * "Add to Home Screen" steps for iOS, which never offers installation itself.
 * Only on the start page: a city page is usually opened from a link, for the weather.
 */
export function InstallHint() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(() => shouldShowInstallHint(currentPlatform(), isInstallHintDismissed()));
  if (!visible) return null;

  // The translation marks where the icon goes: word order differs between languages.
  const [before, after] = t.installHint.steps.split('{icon}');

  return (
    <aside className="install-hint" aria-labelledby="install-hint-title">
      <img className="install-hint__logo" src="/logo.svg" alt="" width="40" height="40" />
      <div>
        <h2 id="install-hint-title" className="install-hint__title">
          {t.installHint.title}
        </h2>
        <p className="install-hint__text">
          {before}
          <ShareIcon />
          {after}
        </p>
      </div>
      <button
        type="button"
        className="install-hint__close"
        aria-label={t.installHint.dismiss}
        onClick={() => {
          dismissInstallHint();
          setVisible(false);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </aside>
  );
}
