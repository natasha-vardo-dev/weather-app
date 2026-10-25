import type { AirQualityLevel, AirQualitySummary, ErrorCode, WeatherCondition } from '@weather/shared';
import type { Plural } from './plural';

/**
 * Every user-facing string. Each language file must implement all of it,
 * so a missing translation is a compile error, not a blank on screen.
 * Functions take already-formatted values (percent strings) or plain numbers for plurals.
 */
export interface Messages {
  appName: string;
  language: string;
  /** Label of the °C / °F switch, for screen readers. */
  temperatureUnit: string;
  dataBy: string;
  home: { title: string; text: (days: number) => string };
  notFound: {
    pageTitle: string;
    title: string;
    pageMissing: string;
    badLink: string;
    goHome: string;
    orSearch: string;
  };
  search: { label: string; searching: string; noResults: (query: string) => string };
  weather: { loading: (place: string) => string; tryAgain: string };
  current: {
    degrees: (n: number) => string;
    highLow: (high: number, low: number) => string;
    warmer: (n: number) => string;
    cooler: (n: number) => string;
    same: string;
    feelsLike: string;
    humidity: string;
    wind: string;
    airQuality: string;
  };
  hourly: { title: (n: number) => string; now: string; rainChance: (percent: string) => string };
  daily: {
    title: (n: number) => string;
    today: string;
    yesterday: string;
    rain: (percent: string) => string;
  };
  conditions: Record<WeatherCondition, string>;
  airQualityLevels: Record<AirQualityLevel, string>;
  /** Which index the value is on; shown as a tooltip. */
  airQualityScales: Record<AirQualitySummary['scale'], string>;
  /** Names spoken by screen readers; the screen shows formulas (O₃, NO₂). */
  pollutants: { title: string; ozone: string; nitrogenDioxide: string };
  favorites: {
    title: string;
    /** Button label for a city that is not saved yet. */
    save: string;
    /** Button label for a saved city; pressing it removes the city. */
    saved: string;
    add: string;
    remove: string;
    full: (max: number) => string;
    /** Button label for a city that is not the home city. */
    setHome: string;
    /** Button label for the home city; also marks it in lists for screen readers. */
    homeCity: string;
    /** Hidden text: what pressing "Home city" does. */
    unsetHome: string;
  };
  errors: Record<ErrorCode, string>;
}

export interface Formatters {
  /** Formats a whole number in the user's locale ("14", Arabic-Indic "١٤" for ar-EG). */
  num: (n: number) => string;
  /** Temperature with the degree sign, kept next to the number in right-to-left text. */
  deg: (n: number) => string;
  plural: Plural;
}

/**
 * A language file is a function of the formatters, because digits depend on the full
 * locale (ar vs ar-EG), not just on the language the text is written in.
 */
export type MessagesFactory = (format: Formatters) => Messages;
