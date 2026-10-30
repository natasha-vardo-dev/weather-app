import {
  dewPointComfort,
  formatHour,
  nextSunEvents,
  pressureTrend,
  uvLevel,
  uvProtectionWindow,
  visibilityLevel,
  type Forecast,
} from '@weather/shared';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chartScale } from '../chartScale';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { hasPollutants, PollutantsPanel } from './AirQualityDetails';
import { ChevronIcon } from './ChevronIcon';
import { HourlyChart } from './HourlyChart';

/** Which tile is expanded below the grid: a 24-hour chart, or the pollutants. */
type Detail = 'precipitation' | 'wind' | 'humidity' | 'uv' | 'pressure' | 'airQuality';

interface TileProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  title?: string;
  /** What the tile opens below the grid; without it (or without data) a plain tile. */
  opener?: {
    canOpen: boolean;
    open: boolean;
    onToggle: () => void;
    panelId: string;
    /** Hidden text at the end, so the button says what it opens ("…, Next 24 hours"). */
    opens: string;
  };
}

/**
 * One tile. With something behind it, the whole tile is a button that opens it below the
 * grid (one open at a time), with the same arrow as the dropdowns, turned up when open.
 */
function Tile({ label, value, note, title, opener }: TileProps) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {note && <span className="tile__note">{note}</span>}
    </>
  );
  if (!opener?.canOpen) {
    return (
      <div className="tile" title={title}>
        {body}
      </div>
    );
  }
  const { open, onToggle, panelId, opens } = opener;
  return (
    <button
      type="button"
      className="tile tile--button"
      aria-expanded={open}
      aria-controls={panelId}
      title={title}
      onClick={onToggle}
    >
      {body}
      <span className="visually-hidden">, {opens}</span>
      <ChevronIcon className="tile__chevron" />
    </button>
  );
}

/** Points where the wind goes; the forecast gives where it comes from (0 = from the north). */
function WindArrow({ from }: { from: number }) {
  return (
    <svg className="tile__arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4v16M6 10l6-6 6 6" transform={`rotate(${from + 180} 12 12)`} />
    </svg>
  );
}

/** Where the UV index sits on the WHO scale (0–11+), as a dot on a green-to-violet bar. */
function UvBar({ value }: { value: number }) {
  return (
    <span className="uvbar" aria-hidden="true">
      <span className="uvbar__dot" style={{ insetInlineStart: `${Math.min(value / 11, 1) * 100}%` }} />
    </span>
  );
}

interface Props {
  forecast: Forecast;
  /** Undefined while loading (the tile is kept), null hides it (no data or error). */
  airQuality: AirQualityView | null | undefined;
}

/**
 * The details of the current weather as tiles below the 10-day forecast: the top of the page
 * stays "now and the next days", the details are there for those who scroll. Each tile with
 * hourly data opens its 24-hour chart below the grid; air quality opens the pollutants.
 */
export function WeatherTiles({ forecast, airQuality }: Props) {
  const { t, locale, deg, speed, percent, num } = useI18n();
  const { temp } = useUnits();
  const { current, units } = forecast;
  // One expanded tile at a time; a new place starts with all folded (remounted per place).
  const [open, setOpen] = useState<Detail | null>(null);
  const toggle = (detail: Detail) => setOpen((now) => (now === detail ? null : detail));
  const id = useId();
  // The effect below builds the same id inline: this function is new on every render.
  const panelId = (detail: Detail) => `${id}-${detail}`;

  // Opening a panel below the bottom of the screen would look like nothing happened: bring
  // it into view. Only when opening from closed (switching keeps the panel where it is),
  // only as far as needed ('nearest'), and without smooth motion if the user asked for less.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(`${id}-${open}`)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    wasOpen.current = open !== null;
  }, [open, id]);

  const hours = forecast.hourly;
  const next = t.hourly.title(hours.length);
  // Missing values are gaps, never NaN: a forecast cached before a field existed (client
  // and server deploy separately, answers stay cached for minutes) may not have it.
  const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const series = {
    precipitation: hours.map((hour) => finite(hour.precipitationProbability)),
    wind: hours.map((hour) => finite(hour.windSpeed)),
    humidity: hours.map((hour) => finite(hour.humidity)),
    uv: hours.map((hour) => finite(hour.uvIndex)),
    pressure: hours.map((hour) => finite(hour.pressure)),
  };
  const hasData = (values: (number | null)[]) => values.some((value) => value !== null);
  const precipitationNow = series.precipitation[0] ?? null;
  const amounts = hours.map((hour) => finite(hour.precipitation)).filter((v): v is number => v !== null);
  const total = amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : null;
  const amount = (value: number) => {
    const unit = units.precipitation ?? 'mm';
    return unit === 'mm'
      ? new Intl.NumberFormat(locale, { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 }).format(value)
      : `${num(Math.round(value * 10) / 10)} ${unit}`;
  };
  const gusts = finite(current.windGusts);
  const direction = finite(current.windDirection);
  // The rest comes from the current hour: the provider has no "current" UV, pressure and so on.
  const hour = hours[0];
  const uv = finite(hour?.uvIndex);
  const pressure = finite(hour?.pressure);
  const visibility = finite(hour?.visibility);
  const dewPoint = finite(hour?.dewPoint);
  // A local "YYYY-MM-DDTHH:mm" as a clock time; index 1 so it is never "Now".
  const clock = (time: string) => formatHour(time, 1, { locale });
  const protection = uvProtectionWindow(hours);
  // A window still going at the end of the data shows no end: "11 AM–…".
  // In the evening the next window is tomorrow's: say so ("tomorrow 11 AM–4 PM"), or it reads
  // as today. The word comes from Intl, so every language has it.
  const protectionDay =
    protection && protection.from.slice(0, 10) > current.time.slice(0, 10)
      ? `${new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(1, 'day')} `
      : '';
  const trend = pressureTrend(hours);
  const sun = nextSunEvents(current.time, forecast.daily);
  // Pressure without a thousands separator: "1011 hPa", as barometers and forecasts write it.
  const plain = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
  const hPa = (value: number) => `${plain.format(value)} ${t.tiles.hPa}`;
  const km = (metres: number) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: metres < 10_000 ? 1 : 0 }).format(
      metres / 1000,
    );

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
    {
      detail: 'uv' as const,
      title: `${t.tiles.uvIndex} · ${next}`,
      values: series.uv,
      scale: chartScale(series.uv, { fromZero: true }),
      kind: 'line' as const,
      variant: 'uv' as const,
      formatTick: num,
      formatValue: (v: number) => `${num(Math.round(v))} · ${t.tiles.uvLevels[uvLevel(v)]}`,
    },
    {
      detail: 'pressure' as const,
      title: `${t.tiles.pressure} · ${next}`,
      values: series.pressure,
      scale: chartScale(series.pressure),
      kind: 'line' as const,
      variant: 'pressure' as const,
      formatTick: (v: number) => plain.format(v),
      formatValue: hPa,
    },
  ];
  const opener = (detail: Detail, canOpen: boolean, opens = next) => ({
    canOpen,
    open: open === detail,
    onToggle: () => toggle(detail),
    panelId: panelId(detail),
    opens,
  });

  return (
    <section className="tiles" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="visually-hidden">
        {t.current.details}
      </h2>
      <ul className="tiles__grid">
        {precipitationNow !== null && (
          <li>
            <Tile
              label={t.current.precipitation}
              value={percent(precipitationNow)}
              note={total !== null ? `${next}: ${amount(total)}` : undefined}
              opener={opener('precipitation', hasData(series.precipitation))}
            />
          </li>
        )}
        <li>
          <Tile
            label={t.current.wind}
            value={
              <>
                {direction !== null && <WindArrow from={direction} />}
                {speed(current.windSpeed, units.windSpeed)}
              </>
            }
            note={gusts !== null ? t.current.gusts(speed(gusts, units.windSpeed)) : undefined}
            opener={opener('wind', hasData(series.wind))}
          />
        </li>
        <li>
          <Tile
            label={t.current.humidity}
            value={percent(current.humidity)}
            note={
              dewPoint !== null
                ? `${t.tiles.dewPoint(deg(temp(dewPoint)))} · ${t.tiles.comfort[dewPointComfort(dewPoint)]}`
                : undefined
            }
            opener={opener('humidity', hasData(series.humidity))}
          />
        </li>
        {airQuality === undefined && (
          // Same slot while loading, so the grid does not reflow when the value arrives.
          <li aria-hidden="true">
            <div className="tile">
              <span className="tile__label">{t.current.airQuality}</span>
              <span className="tile__value">
                <span className="skeleton__block skeleton__inline" />
              </span>
            </div>
          </li>
        )}
        {airQuality && (
          <li>
            <Tile
              label={t.current.airQuality}
              value={
                <>
                  <span
                    className="aqi__dot"
                    data-scale={airQuality.summary.scale}
                    data-level={airQuality.summary.level}
                    aria-hidden="true"
                  />
                  {num(airQuality.summary.value)}
                </>
              }
              note={t.airQualityLevels[airQuality.summary.level]}
              title={t.airQualityScales[airQuality.summary.scale]}
              opener={opener('airQuality', hasPollutants(airQuality), t.pollutants.title)}
            />
          </li>
        )}
        {uv !== null && (
          <li>
            <Tile
              label={t.tiles.uvIndex}
              value={
                <>
                  {num(Math.round(uv))}
                  <span className="tile__unit">{t.tiles.uvLevels[uvLevel(uv)]}</span>
                </>
              }
              note={
                <>
                  <UvBar value={uv} />
                  {protection ? t.tiles.uvProtect(protectionDay + clock(protection.from), protection.until ? clock(protection.until) : '…') : t.tiles.uvNone}
                </>
              }
              opener={opener('uv', hasData(series.uv))}
            />
          </li>
        )}
        {pressure !== null && (
          <li>
            <Tile
              label={t.tiles.pressure}
              value={
                <>
                  {plain.format(pressure)}
                  <span className="tile__unit">{t.tiles.hPa}</span>
                </>
              }
              note={trend ? t.tiles.pressureTrends[trend] : undefined}
              opener={opener('pressure', hasData(series.pressure))}
            />
          </li>
        )}
        {sun && (
          <li>
            <Tile
              label={t.tiles[sun[0].event]}
              value={clock(sun[0].time)}
              note={sun[1] ? `${t.tiles[sun[1].event]} ${clock(sun[1].time)}` : undefined}
            />
          </li>
        )}
        {visibility !== null && (
          <li>
            <Tile
              label={t.tiles.visibility}
              value={km(visibility)}
              note={t.tiles.visibilityLevels[visibilityLevel(visibility)]}
            />
          </li>
        )}
      </ul>
      {charts
        .filter((chart) => hasData(chart.values))
        .map(({ detail, ...chart }) => (
          // All panels exist (aria-controls must point at something); only the open one shows.
          <section key={detail} id={panelId(detail)} className="detail-panel" aria-label={chart.title} hidden={open !== detail}>
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
