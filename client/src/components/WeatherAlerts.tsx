import { isAlertActive, type AlertLevel, type AlertsResponse, type WeatherAlert } from '@weather/shared';
import { useId, useState } from 'react';
import { formatAlertTime } from '../alertTime';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronIcon } from './ChevronIcon';

/** Warning triangle in the level's colour; decorative: the level is written out. */
function WarningIcon({ size = 22 }: { size?: number }) {
  return (
    <svg className="alert__icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="alert__icon-shape" d="M12 2.8 1.9 20.5h20.2L12 2.8z" />
      <path className="alert__icon-mark" d="M12 9.2v5.3M12 17.3v.1" />
    </svg>
  );
}

/**
 * Just the triangle of the most severe warning, for favourite tiles and cards. Decorative:
 * the tile's screen-reader sentence names the level.
 */
export function AlertMark({ level, size = 14, className }: { level: AlertLevel; size?: number; className?: string }) {
  return (
    <span className={['alert-mark', `alert--${level}`, className].filter(Boolean).join(' ')}>
      <WarningIcon size={size} />
    </span>
  );
}

function AlertItem({ alert, timeZone }: { alert: WeatherAlert; timeZone?: string }) {
  const { t, locale } = useI18n();
  const time = (iso: string) => formatAlertTime(iso, { locale, timeZone });
  // Times are the place's, so they wait for its time zone (it comes with the forecast):
  // shown first in the reader's zone, they would jump, "today" and all, a moment later.
  const startKnown = Number.isFinite(Date.parse(alert.onset));
  const when = !timeZone
    ? null
    : !startKnown || isAlertActive(alert, Date.now())
      ? t.alerts.until(time(alert.expires))
      : t.alerts.fromTo(time(alert.onset), time(alert.expires));
  // A type we have no word for keeps the issuer's own name of the event.
  const what = alert.type === 'other' ? alert.event : t.alerts.types[alert.type];
  const summary = (
    <>
      <WarningIcon />
      <span className="alert__text">
        <span className="alert__title">{t.alerts.heading(t.alerts.levels[alert.level], what)}</span>
        {when && <span className="alert__time">{when}</span>}
      </span>
    </>
  );

  const details = [alert.headline, alert.description, alert.instruction].filter(Boolean);
  if (details.length === 0 && !alert.sender) {
    return <li className={`alert alert--${alert.level}`}><div className="alert__summary">{summary}</div></li>;
  }

  return (
    <li className={`alert alert--${alert.level}`}>
      <details>
        <summary className="alert__summary">
          {summary}
          <ChevronIcon className="alert__chevron" />
        </summary>
        {/* The issuer's own words, unmodified (MeteoAlarm terms), in their language; dir="auto"
            so English text keeps its direction in an Arabic or Hebrew interface. */}
        <div className="alert__body" lang={alert.language}>
          {alert.headline && <p className="alert__headline" dir="auto">{alert.headline}</p>}
          {alert.description && <p dir="auto">{alert.description}</p>}
          {alert.instruction && <p dir="auto">{alert.instruction}</p>}
        </div>
        {alert.sender && (
          <p className="alert__source">
            {t.alerts.issuedBy} <bdi lang={alert.language}>{alert.sender}</bdi>
          </p>
        )}
      </details>
    </li>
  );
}

/**
 * Official warnings for the place (Europe: MeteoAlarm), most severe first. Nothing while
 * loading, without warnings or on error: the absence of a banner is not a promise of calm
 * weather, which the README states.
 *
 * Only the most severe one shows at first, the rest behind "2 more warnings": four cards
 * (red rain and storms today, yellow ones tomorrow) took half a phone screen above the
 * weather. The first is always the most severe and soonest, so nothing urgent is folded.
 */
export function WeatherAlerts({ data, timeZone }: { data: AlertsResponse | undefined; timeZone?: string }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const listId = useId();
  if (!data?.alerts.length) return null;
  const hidden = data.alerts.length - 1;
  const shown = all ? data.alerts : data.alerts.slice(0, 1);

  return (
    <section className="alerts" aria-labelledby="alerts-title">
      <h2 id="alerts-title" className="visually-hidden">
        {t.alerts.title}
      </h2>
      <ul className="alerts__list" id={listId}>
        {shown.map((alert) => (
          <AlertItem key={alert.id} alert={alert} timeZone={timeZone} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="alerts__more"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((open) => !open)}
        >
          {all ? t.alerts.fewer : t.alerts.more(hidden)}
          <ChevronIcon className="alerts__more-chevron" />
        </button>
      )}
      {data.attribution && (
        <p className="alerts__credit">
          {t.alerts.source}{' '}
          <a href={data.attribution.url} target="_blank" rel="noreferrer">
            {data.attribution.name}
          </a>
        </p>
      )}
    </section>
  );
}
