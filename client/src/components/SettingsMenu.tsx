import {
  DEFAULT_ALERT_NOTIFICATIONS,
  TEMPERATURE_UNITS,
  type TemperatureUnit,
} from '@weather/shared';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAlertOverview } from '../hooks/useAlertNotifications';
import { useAlerts } from '../hooks/useAlerts';
import { useFavorites } from '../hooks/useFavorites';
import { loadTimeZone } from '../hooks/useForecast';
import { placeTitle, useFavoriteDistinctions, useLocalizedPlaces } from '../hooks/useLocalizedPlace';
import { LANGUAGES, type Language } from '../i18n';
import { useI18n } from '../i18n/I18nProvider';
import { placePath } from '../locationUrl';
import { samePlace, type AlertSubscription } from '../push/alertSubscriptions';
import { PushError } from '../push/pushClient';
import { addTyped, isTyping, nextTypeaheadIndex, NOTHING_TYPED } from '../typeahead';
import { useUnits } from '../units/UnitProvider';
import { BellIcon, PushStatusNote } from './AlertBell';
import { ChevronIcon } from './ChevronIcon';
import { StarIcon } from './FavoriteButton';

const SYMBOLS: Record<TemperatureUnit, string> = { celsius: '°C', fahrenheit: '°F' };

/** Each language in its own script ("Deutsch", "日本語"), so people can find theirs in any UI language. */
function nativeName(language: Language): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
  } catch {
    return language;
  }
}

const NAMES = LANGUAGES.map(nativeName);

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
  // switched off here it stays, greyed, with its settings, like the others.
  useEffect(() => {
    if (view !== 'alerts') return;
    setAlertRows((rows) => {
      const added = alerts.places.filter((p) => !(rows ?? []).some((r) => samePlace(r, p)));
      return added.length > 0 ? [...(rows ?? []), ...added] : rows;
    });
  }, [view, alerts.places]);

  function openAlerts() {
    setAlertRows((rows) => rows ?? alerts.places);
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
            <AlertsList rows={alertRows ?? alerts.places} back={() => backToMain('alerts')} onNavigate={() => close(false)} />
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

interface ListProps {
  label: string;
  back: string;
  value: Language;
  onChoose: (language: Language) => void;
  onBack: () => void;
}

/**
 * The 19 languages, ARIA listbox: the list takes focus and points at the active option
 * with aria-activedescendant. Arrows, Home/End, Enter/Space choose, typed letters jump
 * ("ne" → Nederlands), Escape goes back. Scrolls itself, not the page.
 */
function LanguageList({ label, back, value, onChoose, onBack }: ListProps) {
  const [active, setActive] = useState(Math.max(0, LANGUAGES.indexOf(value)));
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef(NOTHING_TYPED);
  const id = useId();

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const option = document.getElementById(`${id}-${active}`);
    if (!list || !option) return;
    const top = option.offsetTop - list.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [active, id]);

  function onKeyDown(e: KeyboardEvent) {
    const last = LANGUAGES.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === 'Enter' || (e.key === ' ' && !isTyping(typed.current, Date.now()))) {
      e.preventDefault();
      onChoose(LANGUAGES[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typed.current = addTyped(typed.current, e.key, Date.now());
      setActive(nextTypeaheadIndex(NAMES, active, typed.current.text));
    }
  }

  return (
    <>
      <button type="button" className="settings__back" onClick={onBack}>
        <ChevronIcon className="settings__backward" />
        <span className="visually-hidden">{back}: </span>
        <span id={`${id}-label`}>{label}</span>
      </button>
      <ul
        ref={listRef}
        className="settings__list"
        role="listbox"
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={`${id}-${active}`}
        onKeyDown={onKeyDown}
      >
        {LANGUAGES.map((code, index) => (
          <li
            key={code}
            id={`${id}-${index}`}
            role="option"
            lang={code}
            className={index === active ? 'settings__option settings__option--active' : 'settings__option'}
            aria-selected={code === value}
            onPointerEnter={() => setActive(index)}
            onClick={() => onChoose(code)}
          >
            {NAMES[index]}
          </li>
        ))}
      </ul>
    </>
  );
}

interface AlertRow {
  latitude: number;
  longitude: number;
  name: string;
  url: string;
  saved: boolean;
  /** Its notifications now, if on. */
  subscription?: AlertSubscription;
  /** As it was when the list opened: turning it back on restores its settings. */
  before?: AlertSubscription;
}

/** "{star}" or "{icon}" in a sentence replaced by an icon. */
function withIcon(text: string, token: string, icon: ReactNode): ReactNode {
  const [before, after = ''] = text.split(token);
  return (
    <>
      {before}
      {icon}
      {after}
    </>
  );
}

/**
 * Saved cities first (star, the favourites' order), always listed: notifications can be
 * turned on for them right here, with the default settings. Then other places with
 * notifications on. One of those switched off here stays in the list, switch off, until the
 * menu closes (like a phone's settings: rows don't jump, the same switch turns it back on
 * with its settings), and a line under the list says it will leave. Places turned on
 * meanwhile in another tab join at the end. A city's name opens its page, where the bell
 * sets which warnings come. One change at a time: the other clicks wait it out.
 */
function AlertsList({
  rows,
  back,
  onNavigate,
}: {
  rows: AlertSubscription[];
  back: () => void;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const { favorites } = useFavorites();
  // In the interface language, as on the tiles and cards, with "· island" and what tells
  // namesakes apart (two Józefów): the rows must not look the same, and this is also the
  // name the notification uses.
  const favoriteNames = useLocalizedPlaces(favorites);
  const distinctions = useFavoriteDistinctions(favorites);
  const { status, places, enable, disable } = useAlertOverview();
  // Switches only where they can work; otherwise the bell's explanation (install on iPhone,
  // allow notifications, use the build), as a switch would only ever fail there.
  const usable = status === 'available';
  const [pending, setPending] = useState<AlertRow | null>(null);
  const [failed, setFailed] = useState(false);
  // Places MeteoAlarm does not cover, as the rows find out: the note on why shows only then.
  const [uncovered, setUncovered] = useState<ReadonlySet<string>>(new Set());
  // Stable, because each row reports from an effect that depends on it.
  const reportCoverage = useCallback((key: string, covered: boolean) => {
    setUncovered((keys) => {
      if (keys.has(key) === !covered) return keys;
      const next = new Set(keys);
      if (covered) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const backRef = useRef<HTMLButtonElement>(null);

  const current = (place: { latitude: number; longitude: number }) => places.find((p) => samePlace(p, place));
  const earlier = (place: { latitude: number; longitude: number }) => rows.find((r) => samePlace(r, place));
  const isSaved = (place: { latitude: number; longitude: number }) => favorites.some((f) => samePlace(f, place));
  const listed: AlertRow[] = [
    ...favorites.map((favorite, i) => ({
      latitude: favorite.latitude,
      longitude: favorite.longitude,
      name: [favoriteNames[i] ? placeTitle(favoriteNames[i]!, t.place.island) : favorite.name, distinctions[i]]
        .filter(Boolean)
        .join(' · '),
      url: placePath(favorite),
      saved: true,
      subscription: current(favorite),
      before: earlier(favorite),
    })),
    ...[...rows, ...places.filter((p) => !earlier(p))]
      .filter((place) => !isSaved(place))
      .map((place) => ({
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
        url: place.url,
        saved: false,
        subscription: current(place),
        before: earlier(place),
      })),
  ];
  const leaving = listed.filter((row) => !row.saved && !row.subscription);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  function toggle(row: AlertRow) {
    if (pending) return;
    setPending(row);
    setFailed(false);
    const { latitude, longitude, name, url, before } = row;
    (row.subscription
      ? disable(row.subscription)
      : enable(
          { latitude, longitude, name, url, ...(before?.timeZone ? { timeZone: before.timeZone } : {}) },
          // Only the settings: the name and page are the row's, in the current language.
          before ? { group: before.group, level: before.level } : DEFAULT_ALERT_NOTIFICATIONS,
          // The notification gives a warning's times in the place's zone, as on its page;
          // fetched only when the place has none yet.
          before?.timeZone ? undefined : loadTimeZone(latitude, longitude),
        )
    )
      .catch((error: unknown) => {
        // Refused in the browser's prompt: not a failure to retry. The status is read again
        // on the next render and the blocked explanation takes the switches' place.
        if (!(error instanceof PushError && error.reason === 'blocked')) setFailed(true);
      })
      .finally(() => setPending(null));
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          back();
        }
      }}
    >
      <button ref={backRef} type="button" className="settings__back" onClick={back}>
        <ChevronIcon className="settings__backward" />
        <span className="visually-hidden">{t.back}: </span>
        <span>{t.notify.button}</span>
      </button>
      {listed.length === 0 ? (
        usable ? (
          <p className="settings__note">{t.notify.noneOn}</p>
        ) : (
          <div className="settings__intro">
            <PushStatusNote status={status} onCityPage={false} />
          </div>
        )
      ) : (
        <>
          <div className="settings__intro">
            {/* Where switches can't work (install on iPhone, allowed nowhere, the dev server), why
                first; the list's own rules still apply and follow. */}
            {!usable && (
              <div className="settings__status">
                <PushStatusNote status={status} onCityPage={false} />
              </div>
            )}
            <p>{withIcon(t.notify.listRule, '{star}', <StarIcon className="settings__star" size={13} />)}</p>
            <p>{withIcon(t.notify.howToConfigure, '{icon}', <BellIcon on={false} size={13} />)}</p>
            {listed.some((row) => uncovered.has(`${row.latitude},${row.longitude}`)) && (
              <p>{t.notify.meteoAlarmOnly}</p>
            )}
          </div>
          <ul className="settings__alerts">
            {listed.map((row) => (
              <AlertListItem
                key={`${row.latitude},${row.longitude}`}
                row={row}
                usable={usable}
                pending={pending}
                onToggle={toggle}
                onNavigate={onNavigate}
                onCoverage={reportCoverage}
              />
            ))}
          </ul>
        </>
      )}
      {/* Always in the page, so screen readers announce a failure. */}
      <p className="settings__note" role="status">
        {failed
          ? t.notify.failed
          : leaving.length === 1
            ? t.notify.placeLeavesOnClose(leaving[0]!.name)
            : leaving.length > 1
              ? t.notify.leavesOnClose
              : ''}
      </p>
    </div>
  );
}

/**
 * One place in the warnings list. The switch only where MeteoAlarm covers the place (the
 * `covered` the bell uses, from the same cached /api/alerts answer): elsewhere a switch
 * would show "on" for warnings that never come. A place already on can always be turned off.
 */
function AlertListItem({
  row,
  usable,
  pending,
  onToggle,
  onNavigate,
  onCoverage,
}: {
  row: AlertRow;
  usable: boolean;
  pending: AlertRow | null;
  onToggle: (row: AlertRow) => void;
  onNavigate: () => void;
  /** Reports whether MeteoAlarm covers the place, once known. */
  onCoverage: (key: string, covered: boolean) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const on = Boolean(row.subscription);
  const covered = useAlerts(row.latitude, row.longitude)?.covered;
  const key = `${row.latitude},${row.longitude}`;
  useEffect(() => {
    if (covered !== undefined) onCoverage(key, covered);
  }, [key, covered, onCoverage]);
  const switchable = usable && (on || covered === true);
  return (
    <li className="settings__row settings__row--static">
      <span className={on ? 'settings__place' : 'settings__place settings__place--off'}>
        <Link id={id} className="settings__link" to={row.url} onClick={onNavigate}>
          {row.saved && <StarIcon className="settings__star" size={13} />}
          {row.name}
        </Link>
        <span className="settings__summary">
          {row.subscription
            ? `${row.subscription.group === 'storm' ? t.notify.storms : t.notify.all} · ${t.notify.fromLevel}: ${t.notify.levels[row.subscription.level]}`
            : covered === false
              ? t.notify.uncovered
              : t.notify.off}
        </span>
      </span>
      {switchable && (
        <button
          type="button"
          role="switch"
          className="settings__switch"
          aria-checked={on}
          aria-labelledby={id}
          aria-busy={pending !== null && samePlace(pending, row)}
          // aria-disabled, not disabled: a disabled button drops the keyboard focus it holds,
          // and Escape and Tab would then start from the page.
          aria-disabled={pending !== null || undefined}
          onClick={() => onToggle(row)}
        />
      )}
    </li>
  );
}
