import { formatHour, type HourlyForecast } from '@weather/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChartScale } from '../chartScale';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  hours: readonly HourlyForecast[];
  /** One value per hour, already in the shown unit; null leaves a gap. */
  values: readonly (number | null)[];
  scale: ChartScale;
  kind: 'line' | 'bar';
  /** Picks the mark colour (CSS): what is shown, not its rank. */
  variant: 'precipitation' | 'wind' | 'humidity';
  /** Axis label for a gridline value: short ("12°", "50%", "12"). */
  formatTick: (value: number) => string;
  /** Full value for the tooltip and the table ("12 km/h"). */
  formatValue: (value: number) => string;
  /** What the chart shows; names the hidden table for screen readers. */
  title: string;
}

const HEIGHT = 120;
const PAD = { top: 10, right: 6, bottom: 18, left: 34 };
const BAR_MAX = 12;

/** The chart's own width in pixels, so text keeps its size on phones (no viewBox scaling). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Measured before the first paint, so the chart appears at once; the observer then
    // follows changes (rotation, window resize) and may report late in a background tab.
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A small 24-hour chart, drawn as plain SVG: three kinds of marks over 24 points don't
 * need a chart library (Recharts would nearly double the bundle). One series and one
 * axis per chart, so no legend; the title names it. Recessive gridlines, a 2px line or
 * thin bars rounded at the top. Hover (or a tap) shows the exact value; screen readers get the same
 * numbers as a table, since a picture of a line can't be read out.
 */
export function HourlyChart({ hours, values, scale, kind, variant, formatTick, formatValue, title }: Props) {
  const { t, locale } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  // A finger has no hover, and "pointerleave" follows right after the tap, so a touched
  // hour stays shown until another hour or something outside the chart is touched.
  useEffect(() => {
    if (active === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !ref.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [active, ref]);
  const names = hours.map((hour, i) => formatHour(hour.time, i, { locale, nowLabel: t.hourly.now }));

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const step = values.length ? plotWidth / values.length : 0;
  const x = (i: number) => PAD.left + step * (i + 0.5);
  const y = (v: number) =>
    PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - (v - scale.lo) / (scale.hi - scale.lo || 1));
  // Fewer hour labels on narrow screens, so they never overlap.
  const labelEvery = width < 420 ? 6 : 3;

  let path = '';
  values.forEach((v, i) => {
    if (v === null) return;
    path += `${path && values[i - 1] !== null ? 'L' : 'M'}${x(i)} ${y(v)}`;
  });

  const barWidth = Math.min(BAR_MAX, step * 0.6);
  const base = y(scale.lo);

  return (
    <div className="hchart" ref={ref}>
      {width > 0 && (
        <svg className={`hchart__svg hchart__svg--${variant}`} width={width} height={HEIGHT} aria-hidden="true">
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line className="hchart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
              <text className="hchart__tick" x={PAD.left - 6} y={y(tick) + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {names.map(
            (name, i) =>
              i % labelEvery === 0 && (
                <text key={i} className="hchart__tick" x={x(i)} y={HEIGHT - 4} textAnchor="middle">
                  {name}
                </text>
              ),
          )}
          {kind === 'line' ? (
            <path className="hchart__line" d={path} />
          ) : (
            values.map((v, i) => {
              if (v === null || v <= scale.lo) return null;
              const top = y(v);
              const left = x(i) - barWidth / 2;
              const r = Math.min(4, barWidth / 2, base - top);
              // Rounded at the data end, square at the baseline.
              return (
                <path
                  key={i}
                  className="hchart__bar"
                  d={`M${left} ${base}V${top + r}Q${left} ${top} ${left + r} ${top}H${left + barWidth - r}Q${left + barWidth} ${top} ${left + barWidth} ${top + r}V${base}Z`}
                />
              );
            })
          )}
          {active !== null && values[active] !== null && (
            <g className="hchart__focus">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={base} />
              {kind === 'line' && <circle cx={x(active)} cy={y(values[active] as number)} r={4} />}
            </g>
          )}
          {/* Hit areas a whole hour wide: bigger than the marks, easy to hover. */}
          {values.map((_, i) => (
            <rect
              key={i}
              x={PAD.left + step * i}
              y={0}
              width={step}
              height={HEIGHT}
              fill="transparent"
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setActive(i);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setActive(null);
              }}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse') setActive(i);
              }}
            />
          ))}
        </svg>
      )}
      {active !== null && values[active] !== null && (
        <div className="hchart__tip" style={{ left: x(active), top: y(values[active] as number) }} aria-hidden="true">
          {names[active]} · {formatValue(values[active] as number)}
        </div>
      )}
      <table className="visually-hidden">
        <caption>{title}</caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={hours[i].time}>
              <th scope="row">{names[i]}</th>
              <td>{v === null ? '—' : formatValue(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
