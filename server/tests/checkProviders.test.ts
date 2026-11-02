import { describe, expect, it, vi } from 'vitest';
import { checkProviders, type Providers } from '../scripts/checkProviders.js';
import { ProviderError } from '../src/errors.js';
import { createFakeProvider } from './fakeProvider.js';

function providers(): Providers {
  const fake = createFakeProvider();
  return {
    openMeteo: {
      getForecast: vi.fn(async (_lat: number, _lon: number, days: number) => {
        const forecast = await fake.getForecast(0, 0, days);
        const day = forecast.daily[0]!;
        const hour = forecast.hourly[0]!;
        return {
          ...forecast,
          daily: Array.from({ length: days }, () => day),
          hourly: Array.from({ length: 24 }, () => hour),
        };
      }),
      getAirQuality: vi.fn(async () => fake.getAirQuality()),
      searchLocations: vi.fn(async () => [
        { id: 1, name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01, timezone: 'Europe/Warsaw' },
      ]),
    },
    meteoAlarm: {
      listWarnings: vi.fn(async () => ({ warnings: [], read: ['PL', 'DE', 'NO', 'FI'], failed: [] })),
      loadWarning: vi.fn(async () => null),
      getAlerts: vi.fn(async () => []),
    },
  };
}

const statuses = async (p: Providers) => (await checkProviders(p)).map(({ name, status }) => `${name}: ${status}`);

describe('checkProviders', () => {
  it('passes when every answer reads', async () => {
    expect((await checkProviders(providers())).every((result) => result.status === 'ok')).toBe(true);
  });

  it('fails a check whose answer no longer reads, and only that one', async () => {
    const p = providers();
    vi.mocked(p.openMeteo.getAirQuality).mockRejectedValue(
      new ProviderError('air-quality: response failed validation'),
    );
    expect(await statuses(p)).toContain('Open-Meteo air quality: failed');
    expect((await checkProviders(p)).filter((result) => result.status === 'failed')).toHaveLength(1);
  });

  it('fails when many feeds fail at once, not when one does', async () => {
    const p = providers();
    vi.mocked(p.meteoAlarm.listWarnings).mockResolvedValue({ warnings: [], read: ['PL', 'DE', 'NO'], failed: ['FI'] });
    expect(await statuses(p)).toContain('MeteoAlarm feeds: ok');
    vi.mocked(p.meteoAlarm.listWarnings).mockResolvedValue({ warnings: [], read: ['PL', 'DE'], failed: ['FI', 'NO'] });
    expect(await statuses(p)).toContain('MeteoAlarm feeds: failed');
  });

  it('skips, not fails, when the provider refuses for load (shared runner addresses)', async () => {
    const p = providers();
    vi.mocked(p.openMeteo.getForecast).mockRejectedValue(new ProviderError('forecast: HTTP 429: Too many requests'));
    expect(await statuses(p)).toContain('Open-Meteo forecast: skipped');
  });

  it('fails when the listed full warnings no longer read as warnings (a CAP format change)', async () => {
    const p = providers();
    const listed = {
      warnings: [{ ref: 'https://feeds.meteoalarm.org/a', source: 'PL', expires: '', areas: [] }],
      read: ['PL'],
      failed: [],
    };
    vi.mocked(p.meteoAlarm.listWarnings).mockResolvedValue(listed);
    vi.mocked(p.meteoAlarm.loadWarning).mockResolvedValue(null);
    expect(await statuses(p)).toContain('MeteoAlarm feeds: failed');

    vi.mocked(p.meteoAlarm.loadWarning).mockResolvedValue({
      id: 'a',
      level: 'yellow',
      type: 'wind',
      onset: '',
      expires: '',
      texts: [{ language: 'en', event: 'Wind' }],
      replaces: [],
    });
    expect(await statuses(p)).toContain('MeteoAlarm feeds: ok');
  });

  it('does not fail on one full warning that fails to download, only when none reads', async () => {
    const p = providers();
    const warning = (ref: string) => ({ ref, source: 'PL', expires: '', areas: [] });
    vi.mocked(p.meteoAlarm.listWarnings).mockResolvedValue({
      warnings: [warning('a'), warning('b')],
      read: ['PL'],
      failed: [],
    });
    vi.mocked(p.meteoAlarm.loadWarning)
      .mockRejectedValueOnce(new ProviderError('feeds.meteoalarm.org: timeout'))
      .mockResolvedValueOnce({
        id: 'b',
        level: 'orange',
        type: 'rain',
        onset: '',
        expires: '',
        texts: [{ language: 'en', event: 'Rain' }],
        replaces: [],
      });
    expect(await statuses(p)).toContain('MeteoAlarm feeds: ok');

    vi.mocked(p.meteoAlarm.loadWarning).mockRejectedValue(new ProviderError('feeds.meteoalarm.org: timeout'));
    const [feeds] = (await checkProviders(p)).filter((result) => result.name === 'MeteoAlarm feeds');
    expect(feeds).toMatchObject({ status: 'failed', detail: expect.stringContaining('timeout') });
  });
});
