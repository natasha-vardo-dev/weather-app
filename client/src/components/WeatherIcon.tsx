import type { WeatherIcon as IconKind } from '@weather/shared';
import type { ReactNode } from 'react';

// Hand-drawn 24×24 filled icons. Icon libraries (e.g. lucide) are outline-only:
// filling them breaks the rain/snow/storm shapes, whose cloud outline is open
// and whose drops sit inside it. Colors come from CSS classes, so both themes work.

const SUN = (
  <g className="wi-sun">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </g>
);

const MOON = <path className="wi-moon" d="M15.5 3.5a8.5 8.5 0 1 0 5 14.5A7 7 0 0 1 15.5 3.5z" />;

const CLOUD = (
  <path className="wi-cloud" d="M7 19h10.5a4.2 4.2 0 0 0 0-8.4 5.8 5.8 0 0 0-11.1 1.6A3.4 3.4 0 0 0 7 19z" />
);

/** Cloud raised to leave room for rain, snow, fog or lightning below it. */
const HIGH_CLOUD = (
  <path className="wi-cloud" d="M7 15h10.5a4.2 4.2 0 0 0 0-8.4 5.8 5.8 0 0 0-11.1 1.6A3.4 3.4 0 0 0 7 15z" />
);

/** Smaller cloud in the lower right, in front of a sun or moon. */
const FRONT_CLOUD = (
  <path className="wi-cloud" d="M9 20.5h9.5a3.8 3.8 0 0 0 0-7.6 5.2 5.2 0 0 0-10 1.4A3.1 3.1 0 0 0 9 20.5z" />
);

const day: Record<IconKind, ReactNode> = {
  clear: SUN,
  'partly-cloudy': (
    <>
      <g className="wi-sun">
        <circle cx="8.5" cy="8.5" r="3.6" />
        <path d="M8.5 1.8v1.6M1.8 8.5h1.6M3.8 3.8l1.1 1.1M13.2 3.8l-1.1 1.1" />
      </g>
      {FRONT_CLOUD}
    </>
  ),
  cloudy: CLOUD,
  fog: (
    <>
      {HIGH_CLOUD}
      <path className="wi-line" d="M5 18h14M7 21.5h10" />
    </>
  ),
  drizzle: (
    <>
      {HIGH_CLOUD}
      <path className="wi-drop" d="M8.5 17.5l-.5 1.5M12.5 19.5l-.5 1.5M16.5 17.5l-.5 1.5" />
    </>
  ),
  rain: (
    <>
      {HIGH_CLOUD}
      <path className="wi-drop" d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3" />
    </>
  ),
  snow: (
    <>
      {HIGH_CLOUD}
      <g className="wi-flake">
        <circle cx="8" cy="18.5" r="1.1" />
        <circle cx="12" cy="20.5" r="1.1" />
        <circle cx="16" cy="18.5" r="1.1" />
      </g>
    </>
  ),
  storm: (
    <>
      {HIGH_CLOUD}
      <path className="wi-bolt" d="M13 13.5l-3.5 5h3l-1.5 4 4.5-5.5h-3l2-3.5z" />
    </>
  ),
};

const night: Partial<Record<IconKind, ReactNode>> = {
  clear: MOON,
  'partly-cloudy': (
    <>
      <path className="wi-moon" d="M9.5 2.5a5.5 5.5 0 1 0 4.5 8.5A4.5 4.5 0 0 1 9.5 2.5z" />
      {FRONT_CLOUD}
    </>
  ),
};

interface Props {
  icon: IconKind;
  isDay: boolean;
  size?: number;
}

/** Decorative: the text next to it (or screen-reader text) already describes the weather. */
export function WeatherIcon({ icon, isDay, size = 24 }: Props) {
  return (
    <svg className="weather-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(!isDay && night[icon]) || day[icon]}
    </svg>
  );
}
