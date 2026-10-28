/** Data contract between the API and every client (web, mobile). */

/**
 * What a place is, when it is not a town: shown next to the name, since search can return
 * a town and an island of the same name in the same region (Rhodes). Optional and open to
 * more kinds; clients ignore ones they do not know.
 */
export type PlaceKind = 'island';

export interface Location {
  id: number;
  name: string;
  country: string;
  region?: string;
  /**
   * The levels below the region, most general first (province, district, municipality;
   * GeoNames admin2–admin4), '' where a level is missing so positions line up across places.
   * Tells same-named villages apart: two "Rode" in one Belgian province differ only by
   * municipality.
   */
  areas?: string[];
  kind?: PlaceKind;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
}

export interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number | null;
}

export interface HourlyForecast {
  /** Local time at the place, "YYYY-MM-DDTHH:mm". */
  time: string;
  temperature: number;
  /** Relative humidity, %. */
  humidity: number;
  /** In `units.windSpeed`, like the current wind. */
  windSpeed: number;
  weatherCode: number;
  precipitationProbability: number | null;
  isDay: boolean;
}

export interface Forecast {
  latitude: number;
  longitude: number;
  timezone: string;
  units: { temperature: string; windSpeed: string };
  current: CurrentWeather;
  /** Yesterday's weather at the place, for comparison. Null if the provider has no data. */
  yesterday: DailyForecast | null;
  /** Next 24 hours, starting with the current hour. */
  hourly: HourlyForecast[];
  /** Starts with today in the place's timezone. */
  daily: DailyForecast[];
}

/** Current air quality. Either index can be missing where the provider has no data. */
export interface AirQuality {
  /** Local time at the place, "YYYY-MM-DDTHH:mm". */
  time: string;
  /** IANA timezone of the place, used to pick the index people there know. */
  timezone: string;
  europeanAqi: number | null;
  usAqi: number | null;
  /** Concentrations in µg/m³. */
  pollutants: {
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogenDioxide: number | null;
  };
}

export interface LocationsResponse {
  locations: Location[];
}

/** What to call a place found by coordinates. */
export interface PlaceName {
  name: string;
  country?: string;
}

/**
 * GET /api/places/reverse: the place at the user's location. When the city is in the search
 * geocoder, these are that city's coordinates and id, the same as when it is found by
 * search, so a saved city and "my location" are one place, not two.
 */
export interface ReversePlace extends PlaceName {
  latitude: number;
  longitude: number;
  /** Search geocoder id, when the city was matched. */
  id?: number;
}
