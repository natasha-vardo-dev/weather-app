import type {
  AirQualityLevel,
  AirQualitySummary,
  AlertLevel,
  AlertType,
  DewPointComfort,
  ErrorCode,
  PressureTrend,
  UvLevel,
  VisibilityLevel,
  WeatherCondition,
} from '@weather/shared';
import type { LocationError } from '../geolocation';
import type { Plural } from './plural';

/**
 * Every user-facing string. Each language file must implement all of it,
 * so a missing translation is a compile error, not a blank on screen.
 * Functions take already-formatted values (percent strings) or plain numbers for plurals.
 */
export interface Messages {
  appName: string;
  /** The short name in the header logo, a product name rather than a description ("Weather"). */
  brandName: string;
  language: string;
  /** Accessible name of the gear button that holds language and temperature unit. */
  settings: string;
  /** Row of the °C / °F switch in the settings. */
  temperature: string;
  /** Back from the language list to the settings, for screen readers. */
  back: string;
  /** Footer: who the place names come from, before "© OpenStreetMap". */
  placesBy: string;
  dataBy: string;
  /** Banner while the browser has no network; the app shows what it saved earlier. */
  offline: string;
  home: { title: string; text: (days: number) => string };
  /** Official weather warnings on a city page. The issuer's own texts are shown as they are. */
  alerts: {
    /** Section heading, for screen readers. */
    title: string;
    /** "Orange warning" */
    levels: Record<AlertLevel, string>;
    /** "Thunderstorm"; for "other" the issuer's own event name is shown. */
    types: Record<Exclude<AlertType, 'other'>, string>;
    /** Joins the two: "Orange warning: Thunderstorm". */
    heading: (level: string, type: string) => string;
    /** Times arrive formatted: "today 20:00", "tomorrow 10:00", "Thu 06:00". */
    until: (time: string) => string;
    fromTo: (start: string, end: string) => string;
    /** Before the national weather service's name. */
    issuedBy: string;
    /** Before "EUMETNET – MeteoAlarm". */
    source: string;
    /** Under the most severe warning when there are more: "2 more warnings". */
    more: (n: number) => string;
    /** The same button once they are shown. */
    fewer: string;
  };
  /** The bell on a city page: push notifications about official warnings. */
  notify: {
    /** The bell button's label. */
    button: string;
    /** The switch: "Notify me about warnings", with the place on a second line. */
    title: string;
    forPlace: (place: string) => string;
    which: string;
    storms: string;
    all: string;
    stormsHint: string;
    fromLevel: string;
    /** Short level names for the switch: "Orange". */
    levels: Record<AlertLevel, string>;
    once: string;
    iosTitle: string;
    /** Contains {icon} where the Share icon goes, like installHint.steps. */
    iosSteps: string;
    blockedTitle: string;
    blockedText: string;
    bannerWorks: string;
    failed: string;
    /** Only in a development build, where there is no service worker. */
    unavailable: string;
    /** Settings: how many cities have notifications on ("2 cities"). */
    cities: (n: number) => string;
    /** Settings: no city has notifications on. */
    off: string;
    /** Settings, empty list: where notifications are turned on. */
    noneOn: string;
    /** Settings: cities switched off stay in the list until the menu closes. */
    leavesOnClose: string;
    /** Settings: the same for one city ("Kraków will leave the list…"). */
    placeLeavesOnClose: (place: string) => string;
    /** Settings, above the list: which cities it shows. `{star}` marks where the star goes. */
    listRule: string;
    /** Settings, above the list: where a city's warnings are set. `{icon}` is the bell. */
    howToConfigure: string;
    /** Settings list: a place MeteoAlarm does not cover, so no switch ("No data from MeteoAlarm", not
        "No warnings", which read as "all calm right now"). */
    uncovered: string;
    /** Settings, above the list, only when it has such a place: why some have no warnings. */
    meteoAlarmOnly: string;
  };
  /** "Add to Home Screen" steps on iOS. `steps` contains `{icon}` where the Share icon goes;
   *  the button names must match iOS's own menu in that language. */
  installHint: { title: string; steps: string; dismiss: string };
  notFound: {
    pageTitle: string;
    title: string;
    pageMissing: string;
    badLink: string;
    goHome: string;
    orSearch: string;
  };
  search: { label: string; searching: string; noResults: (query: string) => string };
  /** What a place is when not a town, shown after its name: "Rhodes · island". */
  place: { island: string };
  weather: { loading: (place: string) => string; tryAgain: string };
  current: {
    degrees: (n: number) => string;
    highLow: (high: number, low: number) => string;
    warmer: (n: number) => string;
    cooler: (n: number) => string;
    same: string;
    feelsLike: string;
    humidity: string;
    /** Chance of precipitation this hour, in the details. */
    precipitation: string;
    wind: string;
    airQuality: string;
    /** Hidden heading of the tiles below the 10-day forecast. */
    details: string;
    /** Under the wind speed in its tile: the current gust speed. */
    gusts: (speed: string) => string;
  };
  /** The tiles below the 10-day forecast: names, bands and their short explanations. */
  tiles: {
    uvIndex: string;
    uvLevels: Record<UvLevel, string>;
    /** When sun protection is needed (UV 3 and above), as two local times. */
    uvProtect: (from: string, until: string) => string;
    uvNone: string;
    sunrise: string;
    sunset: string;
    pressure: string;
    /** Hectopascal, as written in the language. */
    hPa: string;
    pressureTrends: Record<PressureTrend, string>;
    visibility: string;
    visibilityLevels: Record<VisibilityLevel, string>;
    dewPoint: (degrees: string) => string;
    /** How the air feels by its dew point. */
    comfort: Record<DewPointComfort, string>;
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
  pollutants: {
    title: string;
    ozone: string;
    nitrogenDioxide: string;
    /** The mark on each pollutant's bar: WHO's 24-hour (ozone: 8-hour) guideline. */
    guideline: string;
  };
  /** The user's location: the crosshair in the search field and its errors. */
  location: {
    /** Name of the crosshair button. */
    useMine: string;
    /** Announced while the browser looks for the position. */
    locating: string;
    /** Mark next to the place name when it is the user's position. */
    here: string;
    /** Mark instead of `here` when the place was guessed from the IP address. */
    approximate: string;
    /** Button offering the city guessed from the IP when the browser can't locate the user. */
    suggest: (city: string) => string;
    errors: Record<LocationError, string>;
  };
  favorites: {
    title: string;
    /** Button label for a city that is not saved yet. */
    save: string;
    /** Button label for a saved city; pressing it removes the city. */
    saved: string;
    remove: string;
    full: (max: number) => string;
    /** After `full`, when a city is added to a full list: what to do. */
    fullAction: string;
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
