import { TEMPERATURE_UNITS, type TemperatureUnit } from '@weather/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { useAlertOverview } from '../hooks/useAlertNotifications';
import { LANGUAGES } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { type AlertSubscription, samePlace } from '../push/alertSubscriptions';
import { useUnits } from '../units/UnitProvider';
import { ChevronIcon } from './ChevronIcon';
import { AlertsList } from './settings/AlertsList';
import { LanguageList } from './settings/LanguageList';
import { NAMES } from './settings/languageNames';

const SYMBOLS: Record<TemperatureUnit, string> = { celsius: '°C', fahrenheit: '°F' };

function GearIcon() {
  return (
    <svg className="settings__gear" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.33 4.32c.43-1.76 2.92-1.76 3.35 0a1.72 1.72 0 0 0 2.57 1.07c1.54-.94 3.31.83 2.37 2.37a1.72 1.72 0 0 0 1.07 2.57c1.76.43 1.76 2.92 0 3.35a1.72 1.72 0 0 0-1.07 2.57c.94 1.54-.83 3.31-2.37 2.37a1.72 1.72 0 0 0-2.57 1.07c-.43 1.76-2.92 1.76-3.35 0a1.72 1.72 0 0 0-2.57-1.07c-1.54.94-3.31-.83-2.37-2.37a1.72 1.72 0 0 0-1.07-2.57c-1.76-.43-1.76-2.92 0-3.35a1.72 1.72 0 0 0 1.07-2.57c-.94-1.54.83-3.31 2.37-2.37 1 .61 2.3.07 2.57-1.07z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

type View = 'closed' | 'main' | 'language' | 'alerts';

/**
 * Language and temperature unit behind one gear button next to the search, so the header
 * stays one line on a phone (the two switches used to take a line of their own there).
 *
 * A disclosure, not an ARIA menu: the panel holds a link-like row and a two-button switch,
 * and Tab moves through them as usual. The language row opens the list inside the panel
 * (a listbox with arrows, Home/End and typed letters, as the header list had); °C/°F is a
 * switch right in the panel, two values needing no list. "Warnings" lists the places with
 * notifications on, each with a switch (see AlertsList). Escape steps back (list → panel
 * → closed), a click outside or Tab past the end closes it, and focus returns where it was.
 */
export function SettingsMenu() {
  const { t, language, setLanguage } = useI18n();
  const { unit, setUnit } = useUnits();
  const [view, setView] = useState<View>('closed');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const languageRowRef = useRef<HTMLButtonElement>(null);
  const alertsRowRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const alerts = useAlertOverview();
  // No row where notifications can never work (no Firebase config, no Push API).
  const alertsShown = alerts.status !== 'off' && alerts.status !== 'unsupported';
  // The places listed, fixed while the menu is open: one switched off stays, switch off,
  // so rows don't jump and it can be turned back on; it leaves when the menu closes.
  const [alertRows, setAlertRows] = useState<AlertSubscription[] | null>(null);

  function close(returnFocus: boolean) {
    setView('closed');
    setAlertRows(null);
    if (returnFocus) buttonRef.current?.focus();
  }

  // Opening the panel puts focus on the first row; coming back from a list, on its row.
  const [focusRow, setFocusRow] = useState<{ row: 'language' | 'alerts'; n: number }>({ row: 'language', n: 0 });
  useEffect(() => {
    if (view !== 'main') return;
    (focusRow.row === 'alerts' ? alertsRowRef : languageRowRef).current?.focus();
  }, [view, focusRow]);

  useEffect(() => {
    if (view === 'closed') return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [view]);

  function backToMain(row: 'language' | 'alerts' = 'language') {
    setView('main');
    setFocusRow(({ n }) => ({ row, n: n + 1 }));
  }

  // A place turned on meanwhile (another tab) joins the rows kept while the menu is open, so
  // switched off here it stays, greyed, with its settings, like the others. Stored in the kept
  // rows during render, as React advises for state that follows other values (an effect did
  // it a render later); only shown, not stored, it vanished when switched off. (roborev)
  const addedAlertRows = alertRows ? alerts.places.filter((p) => !alertRows.some((r) => samePlace(r, p))) : [];
  if (alertRows && addedAlertRows.length > 0) setAlertRows([...alertRows, ...addedAlertRows]);
  const shownAlertRows = alertRows ?? alerts.places;

  function openAlerts() {
    setAlertRows((rows) => rows ?? shownAlertRows);
    setView('alerts');
  }

  return (
    <div
      className="settings"
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || view === 'closed') return;
        e.preventDefault();
        // A step back from wherever focus is in a view (its back button too), then closed.
        if (view === 'main') close(true);
        else backToMain(view);
      }}
      // Tab past the end closes. Only a move to another element counts: switching between the
      // panel and the list removes the focused element, which may blur with no target.
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (view !== 'closed' && next && !rootRef.current?.contains(next)) close(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="settings__button"
        aria-expanded={view !== 'closed'}
        aria-controls={`${id}-panel`}
        // Safari and Firefox on macOS don't focus a clicked button: keep focus in the panel,
        // or it would close on blur and this click would open it again.
        onMouseDown={(e) => {
          if (view !== 'closed') e.preventDefault();
        }}
        onClick={() => {
          if (view !== 'closed') close(true);
          else {
            setFocusRow(({ n }) => ({ row: 'language', n: n + 1 }));
            setView('main');
          }
        }}
      >
        <GearIcon />
        <span className="visually-hidden">{t.settings}</span>
      </button>
      {view !== 'closed' && (
        <div id={`${id}-panel`} className="settings__panel">
          {view === 'main' ? (
            <>
              <button
                ref={languageRowRef}
                type="button"
                className="settings__row"
                aria-haspopup="listbox"
                onClick={() => setView('language')}
              >
                <span>{t.language}</span>
                <span className="settings__value" lang={language}>
                  {NAMES[LANGUAGES.indexOf(language)]}
                  <ChevronIcon className="settings__forward" />
                </span>
              </button>
              <div className="settings__row settings__row--static">
                <span id={`${id}-unit`}>{t.temperature}</span>
                <span className="settings__units" role="group" aria-labelledby={`${id}-unit`}>
                  {TEMPERATURE_UNITS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="settings__unit"
                      // "°C" stays "°C" in right-to-left languages, not "C°".
                      dir="ltr"
                      aria-pressed={unit === value}
                      onClick={() => setUnit(value)}
                    >
                      {SYMBOLS[value]}
                    </button>
                  ))}
                </span>
              </div>
              {alertsShown && (
                <button ref={alertsRowRef} type="button" className="settings__row" onClick={openAlerts}>
                  <span>{t.notify.button}</span>
                  <span className="settings__value">
                    {alerts.places.length > 0 ? t.notify.cities(alerts.places.length) : t.notify.off}
                    <ChevronIcon className="settings__forward" />
                  </span>
                </button>
              )}
            </>
          ) : view === 'alerts' ? (
            <AlertsList rows={shownAlertRows} back={() => backToMain('alerts')} onNavigate={() => close(false)} />
          ) : (
            <LanguageList
              label={t.language}
              back={t.back}
              value={language}
              onChoose={(next) => {
                setLanguage(next);
                backToMain();
              }}
              onBack={() => backToMain()}
            />
          )}
        </div>
      )}
    </div>
  );
}
