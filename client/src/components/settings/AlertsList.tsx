import { DEFAULT_ALERT_NOTIFICATIONS } from '@weather/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAlertOverview } from '../../hooks/useAlertNotifications';
import { useFavorites } from '../../hooks/useFavorites';
import { loadTimeZone } from '../../hooks/useForecast';
import { placeTitle, useFavoriteDistinctions, useLocalizedPlaces } from '../../hooks/useLocalizedPlace';
import { useI18n } from '../../i18n/I18nProvider';
import { placePath } from '../../locationUrl';
import { samePlace, type AlertSubscription } from '../../push/alertSubscriptions';
import { PushError } from '../../push/pushClient';
import { BellIcon, PushStatusNote } from '../AlertBell';
import { ChevronIcon } from '../ChevronIcon';
import { StarIcon } from '../FavoriteButton';
import { AlertListItem, type AlertRow } from './AlertListItem';

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
export function AlertsList({
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
