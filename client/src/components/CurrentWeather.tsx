import { compareWithYesterday, describeWeather, type Forecast } from '@weather/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chartScale } from '../chartScale';
import type { Whereabouts } from '../geolocation';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { AirQualityItem, hasPollutants, PollutantsPanel } from './AirQualityDetails';
import { ChevronIcon } from './ChevronIcon';
import { HourlyChart } from './HourlyChart';
import { PinIcon } from './LocationIcons';

/** Which detail is expanded below the list: a 24-hour chart, or the pollutants. */
type Detail = 'precipitation' | 'wind' | 'humidity' | 'airQuality';

interface DetailItemProps {
  label: string;
  value: string;
  /** False without hourly data for it: a plain value, nothing to open. */
  canOpen: boolean;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  /** Hidden text after the value, so the button says what it opens ("…, Next 24 hours"). */
  opens: string;
}

/**
 * One detail: the value is a button that opens its 24-hour chart below the list, like
 * air quality opens its pollutants. Every item has the same arrow, turned up when open.
 * The button stays on the value (a dt can't sit inside a button), but its hit area covers
 * the whole item, label included: at least 44 px tall, easy to hit on a phone.
 */
function DetailItem({ label, value, canOpen, open, onToggle, panelId, opens }: DetailItemProps) {
  if (!canOpen) {
    return (
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  }
  return (
    <div className={open ? 'detail-item detail-item--open' : 'detail-item'}>
      <dt>{label}</dt>
      <dd>
        <button type="button" className="detail" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          {value}
          <span className="visually-hidden">, {opens}</span>
          <ChevronIcon className="detail__chevron" />
        </button>
      </dd>
    </div>
  );
}

interface Props {
  name: string;
  country?: string;
  forecast: Forecast;
  /** Controls shown next to the place name, e.g. the save button. */
  actions?: ReactNode;
  /** Undefined while loading (the slot is kept), null hides the item (no data or error). */
  airQuality: AirQualityView | null | undefined;
  /** The place is the user's: "You are here", or "Approximate, by IP" when guessed from the address. */
  here?: Whereabouts | null;
}

export function CurrentWeather({ name, country, forecast, airQuality, actions, here }: Props) {
  const { t, deg, speed, percent, num } = useI18n();
  const { temp } = useUnits();
  const { current, units } = forecast;
  const label = t.conditions[describeWeather(current.weatherCode).condition];
  const today = forecast.daily[0];
  // Compared in the chosen unit, so the difference reads in that unit too (2 °C apart is 4 °F).
  const trend =
    today && forecast.yesterday
      ? compareWithYesterday(temp(today.tempMax), temp(forecast.yesterday.tempMax))
      : null;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // One expanded detail at a time; a new place starts with all folded (remounted per place).
  const [open, setOpen] = useState<Detail | null>(null);
  const toggle = (detail: Detail) => setOpen((current) => (current === detail ? null : detail));
  const id = useId();
  const panelId = (detail: Detail) => `${id}-${detail}`;

  // Opening a panel below the bottom of the screen would look like nothing happened: bring
  // it into view. Only when opening from closed (switching keeps the panel where it is),
  // only as far as needed ('nearest'), and without smooth motion if the user asked for less.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(panelId(open))?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    wasOpen.current = open !== null;
  }, [open]);

  const hours = forecast.hourly;
  const next = t.hourly.title(hours.length);
  // Missing values are gaps, never NaN: a forecast cached before a field existed (client
  // and server deploy separately, answers stay cached for minutes) may not have it.
  const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const series = {
    precipitation: hours.map((hour) => finite(hour.precipitationProbability)),
    wind: hours.map((hour) => finite(hour.windSpeed)),
    humidity: hours.map((hour) => finite(hour.humidity)),
  };
  const hasData = (values: (number | null)[]) => values.some((value) => value !== null);
  const precipitationNow = series.precipitation[0] ?? null;
  const charts = [
    {
      detail: 'precipitation' as const,
      title: `${t.current.precipitation} · ${next}`,
      values: series.precipitation,
      scale: chartScale([], { fixed: [0, 100] }),
      kind: 'bar' as const,
      variant: 'precipitation' as const,
      formatTick: percent,
      formatValue: percent,
    },
    {
      detail: 'wind' as const,
      title: `${t.current.wind} · ${next}`,
      values: series.wind,
      scale: chartScale(series.wind, { fromZero: true }),
      kind: 'line' as const,
      variant: 'wind' as const,
      formatTick: num,
      formatValue: (v: number) => speed(v, units.windSpeed),
    },
    {
      detail: 'humidity' as const,
      title: `${t.current.humidity} · ${next}`,
      values: series.humidity,
      scale: chartScale([], { fixed: [0, 100] }),
      kind: 'line' as const,
      variant: 'humidity' as const,
      formatTick: percent,
      formatValue: percent,
    },
  ];

  // In an SPA the browser doesn't announce "new page", so move focus to the heading:
  // screen readers read the new city, and keyboard users continue from here.
  // Runs on mount only: the page remounts this component for every place (keyed by
  // coordinates), which also starts each place with the pollutants folded. Keying by
  // place, not by name, matters for two saved cities with the same name.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="now" aria-labelledby="now-title">
      <div className="now__head">
        <h1 id="now-title" className="now__place" ref={headingRef} tabIndex={-1}>
          {name}
          {country && <span className="now__country">{country}</span>}
          {/* In the heading, so screen readers hear it with the place name. */}
          {here && (
            <span className={here === 'approximate' ? 'now__here now__here--approximate' : 'now__here'}>
              <PinIcon />
              {here === 'approximate' ? t.location.approximate : t.location.here}
            </span>
          )}
        </h1>
        {actions}
      </div>
      {/* aria-label is not allowed on a paragraph and often ignored: hidden text instead. */}
      <p className="now__temp">
        <span className="visually-hidden">{t.current.degrees(temp(current.temperature))}</span>
        <span aria-hidden="true">{deg(temp(current.temperature))}</span>
      </p>
      {/* Next to the temperature it qualifies, as a line, not a detail: its chart would
          mostly repeat the hourly strip. */}
      <p className="now__feels">
        {t.current.feelsLike} {deg(temp(current.apparentTemperature))}
      </p>
      <p className="now__label">
        {label}
        {today && (
          <span className="now__hilo">
            {' '}
            {t.current.highLow(temp(today.tempMax), temp(today.tempMin))}
          </span>
        )}
      </p>
      {trend && (
        <p className="now__trend">
          {trend.trend === 'same'
            ? t.current.same
            : t.current[trend.trend](trend.difference)}
        </p>
      )}
      <dl className="now__details">
        {precipitationNow !== null && (
          <DetailItem
            label={t.current.precipitation}
            value={percent(precipitationNow)}
            canOpen={hasData(series.precipitation)}
            open={open === 'precipitation'}
            onToggle={() => toggle('precipitation')}
            panelId={panelId('precipitation')}
            opens={next}
          />
        )}
        <DetailItem
          label={t.current.wind}
          value={speed(current.windSpeed, units.windSpeed)}
          canOpen={hasData(series.wind)}
          open={open === 'wind'}
          onToggle={() => toggle('wind')}
          panelId={panelId('wind')}
          opens={next}
        />
        <DetailItem
          label={t.current.humidity}
          value={percent(current.humidity)}
          canOpen={hasData(series.humidity)}
          open={open === 'humidity'}
          onToggle={() => toggle('humidity')}
          panelId={panelId('humidity')}
          opens={next}
        />
        {airQuality === undefined && (
          // Same slot while loading, so the row does not reflow when the value arrives.
          <div aria-hidden="true">
            <dt>{t.current.airQuality}</dt>
            <dd>
              <span className="skeleton__block skeleton__inline" />
            </dd>
          </div>
        )}
        {airQuality && (
          <AirQualityItem
            airQuality={airQuality}
            open={open === 'airQuality'}
            onToggle={() => toggle('airQuality')}
            panelId={panelId('airQuality')}
          />
        )}
      </dl>
      {charts
        .filter((chart) => hasData(chart.values))
        .map(({ detail, ...chart }) => (
          // All panels exist (aria-controls must point at something); only the open one shows.
          <section
            key={detail}
            id={panelId(detail)}
            className="detail-panel"
            aria-label={chart.title}
            hidden={open !== detail}
          >
            <p className="detail-panel__title" aria-hidden="true">
              {chart.title}
            </p>
            {open === detail && <HourlyChart hours={hours} {...chart} />}
          </section>
        ))}
      {airQuality && hasPollutants(airQuality) && (
        <PollutantsPanel airQuality={airQuality} open={open === 'airQuality'} id={panelId('airQuality')} />
      )}
    </section>
  );
}
