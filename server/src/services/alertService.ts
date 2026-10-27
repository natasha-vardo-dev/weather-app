import { compareAlerts, type AlertsResponse, type WeatherAlert } from '@weather/shared';
import type { AlertText, AlertsProvider } from '../providers/types.js';

/**
 * The text in the user's language if the issuer wrote one (by base language: "pl" takes
 * "pl-PL"), else English, else whatever there is. The texts themselves are not translated
 * or edited: the source's terms require them unmodified.
 */
export function pickText(texts: AlertText[], language: string): AlertText | undefined {
  const base = (tag: string) => tag.toLowerCase().split('-')[0];
  return (
    texts.find((t) => base(t.language) === base(language)) ??
    texts.find((t) => base(t.language) === 'en') ??
    texts[0]
  );
}

/** Official warnings for a place, in the shape the API returns. Caching is the provider's (per country feed). */
export class AlertService {
  constructor(
    private readonly provider: AlertsProvider,
    private readonly now: () => number = Date.now,
  ) {}

  async getAlerts(latitude: number, longitude: number, language: string): Promise<AlertsResponse> {
    const now = this.now();
    const alerts: WeatherAlert[] = [];
    for (const alert of await this.provider.getAlerts(latitude, longitude)) {
      const text = pickText(alert.texts, language);
      if (!text || !(Date.parse(alert.expires) > now)) continue;
      alerts.push({
        id: alert.id,
        level: alert.level,
        type: alert.type,
        // Untrusted input: a warning with no readable start is shown as in force, never
        // passed on as a date clients can't format.
        onset: Number.isFinite(Date.parse(alert.onset)) ? alert.onset : new Date(now).toISOString(),
        expires: alert.expires,
        ...text,
      });
    }
    alerts.sort(compareAlerts);
    return { alerts, attribution: alerts.length ? this.provider.attribution : null };
  }
}
