import { ALERT_GROUPS, ALERT_LEVELS, type AlertNotificationSettings } from '@weather/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { useI18n } from '../i18n/I18nProvider';
import type { PushAvailability } from '../push/availability';
import { SpinnerIcon } from './LocationIcons';
import { ShareIcon } from './InstallHint';

export function BellIcon({ on, size = 16 }: { on: boolean; size?: number }) {
  return (
    <svg
      className={on ? 'bell__icon bell__icon--on' : 'bell__icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Why notifications can't be switched on here, and what to do: install on iPhone, allow them
 * in the browser, or use the build. Nothing when they are available. Shared by the bell and
 * the warnings list in the settings.
 */
export function PushStatusNote({ status, onCityPage = true }: { status: PushAvailability; onCityPage?: boolean }) {
  const { t } = useI18n();
  if (status === 'ios-install') {
    const [before, after] = t.notify.iosSteps.split('{icon}');
    return (
      <>
        <p className="bell__title">{t.notify.iosTitle}</p>
        <p className="bell__text">
          {before}
          <ShareIcon />
          {after}
        </p>
      </>
    );
  }
  if (status === 'blocked') {
    return (
      <>
        <p className="bell__title">{t.notify.blockedTitle}</p>
        <p className="bell__text">{t.notify.blockedText}</p>
        {/* "The warnings banner on this page…": only by a city's page. */}
        {onCityPage && <p className="bell__text">{t.notify.bannerWorks}</p>}
      </>
    );
  }
  if (status === 'dev-server') {
    return (
      // For developers only, so not translated.
      <p className="bell__text">
        The development server has no service worker, so notifications can't arrive here. Use the build:{' '}
        <code>npm run build &amp;&amp; npm run preview -w client</code> (port 4173).
      </p>
    );
  }
  return null;
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
 * Warning notifications for this place, behind a bell next to the star. The
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
  // The choice before turning on, or the latest choice while it applies.
  const [draft, setDraft] = useState<AlertNotificationSettings>(saved);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const titleId = useId();
  const on = !!subscription;
  // Which control started the change: it shows a spinner while the others wait. Every hook
  // stays above the early returns below: the bell renders nothing until coverage is known,
  // and a hook added after them crashed the page once it did.
  const [pending, setPending] = useState<'switch' | keyof AlertNotificationSettings>('switch');
  // Once shown on this page, the bell stays while coverage is unknown: turning notifications
  // off must not make it vanish when /api/alerts did not answer (offline, where warnings are
  // deliberately not served from the cache). The page remounts it for each place.
  const [shown, setShown] = useState(false);

  // A disabled control loses focus to <body>; when the lock ends, give it back to the
  // control the user last used, so keyboard users stay in the panel.
  const lastUsed = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (busy || !open) return;
    if (document.activeElement === document.body && lastUsed.current?.isConnected) lastUsed.current.focus();
  }, [busy, open]);

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

  const hidden =
    status === 'off' ||
    status === 'unsupported' ||
    // Known not covered (Minsk, New York) and off: nothing to offer.
    (!on && props.covered !== true && !(shown && props.covered === undefined));
  // Remembered during render, as React advises for state that follows other values.
  if (!hidden && !shown) setShown(true);
  if (hidden) return null;

  // Once nothing is being applied, the panel shows what is actually stored: a change made in
  // another tab, or the previous settings again after a change failed. Kept in the draft during
  // render (an effect did it a render later), so the draft is still those settings when
  // notifications are then turned off, here or in another tab. (roborev)
  if (on && !busy && (draft.group !== saved.group || draft.level !== saved.level)) {
    setDraft({ group: saved.group, level: saved.level });
  }
  const settings = on && !busy ? saved : draft;
  // While a change is being applied (a second or two: token, then leaving and joining
  // topics) every control is disabled until the server answers; the clicked option keeps
  // its highlight. Disabling drops keyboard focus, so it is given back afterwards.
  const change = (next: Partial<AlertNotificationSettings>) => {
    if (busy) return;
    const chosen = { ...settings, ...next };
    setDraft(chosen);
    setPending('group' in next ? 'group' : 'level');
    if (on) enable(chosen);
  };
  const spinner = (control: typeof pending, selected: boolean) =>
    busy && pending === control && selected ? <SpinnerIcon size={12} /> : null;

  return (
    <span className="bell" ref={wrapRef}>
      {/* An icon button, like the star, so the row fits on one line in every language. The
          name is in hidden text, the tooltip shows it. */}
      <button
        type="button"
        className="save save--icon"
        aria-expanded={open}
        aria-controls={panelId}
        data-on={on || undefined}
        data-tip={t.notify.button}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon on={on} />
        <span className="visually-hidden">{t.notify.button}</span>
      </button>
      <div
        id={panelId}
        className="bell__panel"
        hidden={!open}
        data-busy={busy || undefined}
        aria-busy={busy || undefined}
        onFocus={(e) => (lastUsed.current = e.target)}
      >
        <PushStatusNote status={status} />
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
                  // What is on screen becomes the choice: turned off, the panel keeps showing it,
                  // and turning on again uses it, not an older one from this tab, when the
                  // settings were changed in another. (Found by roborev.)
                  setDraft(settings);
                  void (on ? disable() : enable(settings));
                }}
              />
            </div>
            {/* Settings of notifications that are on: off, they wait, dimmed (decision of the
                project's owner); turning on uses what they show (storms from orange the first
                time, the last settings after turning off). */}
            <fieldset className="bell__choice" disabled={!on}>
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
            <fieldset className="bell__choice" disabled={!on}>
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
