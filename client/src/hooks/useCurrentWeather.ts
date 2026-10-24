import { describeWeather, type WeatherCondition, type WeatherIcon } from '@weather/shared';
import { useForecast } from './useForecast';

export interface CurrentWeatherSummary {
  condition: WeatherCondition;
  icon: WeatherIcon;
  isDay: boolean;
  /** Rounded, as shown on screen. */
  temperature: number;
  /** Today's high and low at the place, rounded; null if the forecast has no days. */
  high: number | null;
  low: number | null;
}

/**
 * Current weather for a saved city, or null while loading or on error (a favourite
 * then shows just its name). Same request as the city page, so they share caches.
 */
export function useCurrentWeather(latitude: number, longitude: number): CurrentWeatherSummary | null {
  const { forecast } = useForecast(latitude, longitude);
  const current = forecast?.current;
  if (!current) return null;
  const { condition, icon } = describeWeather(current.weatherCode);
  const today = forecast.daily[0];
  return {
    condition,
    icon,
    isDay: current.isDay,
    temperature: Math.round(current.temperature),
    high: today ? Math.round(today.tempMax) : null,
    low: today ? Math.round(today.tempMin) : null,
  };
}
