import { ALERT_GROUPS, ALERT_LEVELS, type AlertNotificationSettings } from '@weather/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronIcon } from './ChevronIcon';
import { SpinnerIcon } from './LocationIcons';
import { ShareIcon } from './InstallHint';

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg className={on ? 'bell__icon bell__icon--on' : 'bell__icon'} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

interface Props {
  latitude: number;
  longitude: number;
  /** As shown on the page; the notification names the place with it. */
  name: string;
  url: string;
  timeZone?: string;
  /** Whether warnings exist for the place (from /api/alerts); undefined until known. */
  covered: boolean | undefined;
}

/**
 * Warning notifications for this place, behind a bell next to "Saved" and "Home city". The
 * browser asks for permission only when the switch is turned on, never on page load. The panel
 * explains what can't be done here instead of hiding the bell: on an iPhone in the browser
 * (install first) and when notifications are blocked. Where no warnings are issued (Minsk,
 * New York) there is nothing to notify about, so no bell, unless the place was subscribed
 * earlier and has to be turned off. Hidden until coverage is known, so it never flashes away.
 */
export function AlertBell(props: Props) {
  const { t } = useI18n();
  const { status, subscription, settings: saved, busy, error, enable, disable } = useAlertNotifications(props);
  const [open, setOpen] = useState(false);
  // What the panel shows: chosen before turning on, or the latest choice while it applies.
  const [draft, setDraft] = useState<AlertNotificationSettings>(saved);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const titleId = useId();
  const on = !!subscription;
  // Which control started the change: it shows a spinner while the others wait. Every hook
  // stays above the early returns below: the bell renders nothing until coverage is known,
  // and a hook added after them crashed the page once it did.
  const [pending, setPending] = useState<'switch' | keyof AlertNotificationSettings>('switch');

  // A disabled control loses focus to <body>; when the lock ends, give it back to the
  // control the user last used, so keyboard users stay in the panel.
  const lastUsed = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (busy || !open) return;
    if (document.activeElement === document.body && lastUsed.current?.isConnected) lastUsed.current.focus();
  }, [busy, open]);

  // Once nothing is being applied, show what is actually stored: a change made in another
  // tab, or the previous settings again after a change failed.
  useEffect(() => {
    if (on && !busy) setDraft(saved);
  }, [on, busy, saved.group, saved.level]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'off' || status === 'unsupported') return null;
  if (!on && props.covered !== true) return null;

  const settings = draft;
  // While a change is being applied (a second or two: token, then leaving and joining
  // topics) every control is disabled until the server answers; the clicked option keeps
  // its highlight. Disabling drops keyboard focus, so it is given back afterwards.
  const change = (next: Partial<AlertNotificationSettings>) => {
    if (busy) return;
    const chosen = { ...draft, ...next };
    setDraft(chosen);
    setPending('group' in next ? 'group' : 'level');
    if (on) enable(chosen);
  };
  const spinner = (control: typeof pending, selected: boolean) =>
    busy && pending === control && selected ? <SpinnerIcon size={12} /> : null;
  const [before, after] = t.notify.iosSteps.split('{icon}');

  return (
    <span className="bell" ref={wrapRef}>
      <button
        type="button"
        className="save"
        aria-expanded={open}
        aria-controls={panelId}
        data-on={on || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon on={on} />
        {t.notify.button}
        <ChevronIcon className="bell__chevron" />
      </button>
      <div
        id={panelId}
        className="bell__panel"
        hidden={!open}
        data-busy={busy || undefined}
        aria-busy={busy || undefined}
        onFocus={(e) => (lastUsed.current = e.target)}
      >
        {status === 'ios-install' && (
          <>
            <p className="bell__title">{t.notify.iosTitle}</p>
            <p className="bell__text">
              {before}
              <ShareIcon />
              {after}
            </p>
          </>
        )}
        {status === 'blocked' && (
          <>
            <p className="bell__title">{t.notify.blockedTitle}</p>
            <p className="bell__text">{t.notify.blockedText}</p>
            <p className="bell__text">{t.notify.bannerWorks}</p>
          </>
        )}
        {status === 'dev-server' && (
          // For developers only, so not translated.
          <p className="bell__text">
            The development server has no service worker, so notifications can't arrive here. Use the build:{' '}
            <code>npm run build &amp;&amp; npm run preview -w client</code> (port 4173).
          </p>
        )}
        {status === 'available' && (
          <>
            <div className="bell__row">
              <span id={titleId}>
                {t.notify.title}
                <span className="bell__text">{t.notify.forPlace(props.name)}</span>
              </span>
              {spinner('switch', true)}
              <button
                type="button"
                role="switch"
                className="bell__switch"
                aria-checked={on}
                aria-labelledby={titleId}
                aria-busy={busy || undefined}
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  setPending('switch');
                  void (on ? disable() : enable(settings));
                }}
              />
            </div>
            <fieldset className="bell__choice">
              <legend>{t.notify.which}</legend>
              {ALERT_GROUPS.map((group) => (
                <label key={group}>
                  <input
                    type="radio"
                    name={`${panelId}-group`}
                    checked={settings.group === group}
                    disabled={busy}
                    onChange={() => change({ group })}
                  />
                  <span>
                    {spinner('group', settings.group === group)}
                    {group === 'storm' ? t.notify.storms : t.notify.all}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="bell__text">{t.notify.stormsHint}</p>
            <fieldset className="bell__choice">
              <legend>{t.notify.fromLevel}</legend>
              {ALERT_LEVELS.map((level) => (
                <label key={level}>
                  <input
                    type="radio"
                    name={`${panelId}-level`}
                    checked={settings.level === level}
                    disabled={busy}
                    onChange={() => change({ level })}
                  />
                  <span>
                    {spinner('level', settings.level === level)}
                    {t.notify.levels[level]}
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="bell__text">{t.notify.once}</p>
            {error && (
              <p className="bell__error" role="alert">
                {error === 'unavailable' ? t.notify.unavailable : t.notify.failed}
              </p>
            )}
          </>
        )}
      </div>
    </span>
  );
}
