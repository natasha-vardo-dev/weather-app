/** Data contract between the API and every client (web, mobile). */

export interface Location {
  id: number;
  name: string;
  country: string;
  region?: string;
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
