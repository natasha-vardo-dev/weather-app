import { guidelineBar, WHO_GUIDELINES } from '@weather/shared';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';

/** True when at least one concentration is known; otherwise there is nothing to expand. */
export function hasPollutants(airQuality: AirQualityView): boolean {
  return Object.values(airQuality.pollutants).some((value) => value !== null);
}

interface PanelProps {
  airQuality: AirQualityView;
  open: boolean;
  id: string;
}

/**
 * Pollutant concentrations, shown under the tiles when air quality is expanded: a bar per
 * pollutant with a mark at the WHO daily guideline, so "13.9 µg/m³" becomes "just under
 * the guideline" without knowing the numbers. Same height as the 24-hour charts, so
 * switching between details doesn't move the page below. Screen readers get each row as
 * a sentence (value and guideline); the bars are decorative.
 */
export function PollutantsPanel({ airQuality, open, id }: PanelProps) {
  const { t, num } = useI18n();
  const { pollutants } = airQuality;
  const rows = [
    { key: 'pm2_5', code: 'PM2.5', name: 'PM2.5', value: pollutants.pm2_5 },
    { key: 'pm10', code: 'PM10', name: 'PM10', value: pollutants.pm10 },
    { key: 'ozone', code: 'O₃', name: t.pollutants.ozone, value: pollutants.ozone },
    { key: 'nitrogenDioxide', code: 'NO₂', name: t.pollutants.nitrogenDioxide, value: pollutants.nitrogenDioxide },
  ] as const;
  const unit = 'µg/m³';

  return (
    <section id={id} className="detail-panel" aria-label={t.pollutants.title} hidden={!open}>
      <p className="detail-panel__title" aria-hidden="true">
        {t.pollutants.title} · {unit} · <span className="pollutants__legend" /> {t.pollutants.guideline}
      </p>
      <ul className="pollutants">
        {rows.map(({ key, code, name, value }) => {
          if (value === null) return null;
          const guideline = WHO_GUIDELINES[key];
          const bar = guidelineBar(value, guideline);
          return (
            <li key={key} className="pollutants__row">
              <span className="visually-hidden">
                {name}: {num(Math.round(value))} {unit}, {t.pollutants.guideline} {num(guideline)} {unit}
              </span>
              {/* Formulas for the eye; full names for screen readers ("O₃" reads badly). */}
              <span className="pollutants__code" aria-hidden="true">
                {code}
              </span>
              <span className="pollutants__track" aria-hidden="true">
                <span className="pollutants__fill" style={{ width: `${bar.value * 100}%` }} />
                <span className="pollutants__mark" style={{ insetInlineStart: `${bar.guideline * 100}%` }} />
              </span>
              <span className="pollutants__value" aria-hidden="true">
                {num(Math.round(value))} <span className="pollutants__unit">/ {num(guideline)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
