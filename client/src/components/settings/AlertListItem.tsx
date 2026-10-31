import { useEffect, useId } from 'react';
import { Link } from 'react-router';
import { useAlerts } from '../../hooks/useAlerts';
import { useI18n } from '../../i18n/I18nProvider';
import { samePlace, type AlertSubscription } from '../../push/alertSubscriptions';
import { StarIcon } from '../FavoriteButton';

/** A row of the warnings list: a saved city or another place with notifications on. */
export interface AlertRow {
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

/**
 * One place in the warnings list. The switch only where MeteoAlarm covers the place (the
 * `covered` the bell uses, from the same cached /api/alerts answer): elsewhere a switch
 * would show "on" for warnings that never come. A place already on can always be turned off.
 */
export function AlertListItem({
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
