export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 10;

export const FORECAST_DEFAULT_DAYS = 10;
export const FORECAST_MAX_DAYS = 16;
export const FORECAST_HOURS = 24;

/**
 * Official warnings must reach users fast: MeteoAlarm's terms allow on average 5 and at
 * most 10 minutes from their publication. The server keeps a country's feed for 4 minutes
 * and browsers may keep an answer for 1, so the two stacked stay under 5.
 */
export const ALERTS_FEED_TTL_SECONDS = 4 * 60;
export const ALERTS_MAX_AGE_SECONDS = 60;
