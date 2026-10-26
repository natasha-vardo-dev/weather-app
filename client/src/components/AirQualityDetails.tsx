import { guidelineBar, WHO_GUIDELINES } from '@weather/shared';
import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';
import { ChevronIcon } from './ChevronIcon';

/** True when at least one concentration is known; otherwise there is nothing to expand. */
export function hasPollutants(airQuality: AirQualityView): boolean {
  return Object.values(airQuality.pollutants).some((value) => value !== null);
}

interface ItemProps {
  airQuality: AirQualityView;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}

/**
 * One entry of the details list: coloured dot, index and level. With pollutant data it is a
 * button that toggles the panel, with the same arrow as the other details; without it,
 * plain text, so it never opens an empty box.
 */
export function AirQualityItem({ airQuality, open, onToggle, panelId }: ItemProps) {
  const { t, num } = useI18n();
  const { summary } = airQuality;
  const value = (
    <>
      <span className="aqi__dot" data-scale={summary.scale} data-level={summary.level} aria-hidden="true" />
      {num(summary.value)} · {t.airQualityLevels[summary.level]}
    </>
  );
  const scale = t.airQualityScales[summary.scale];

  return (
    <div className={hasPollutants(airQuality) ? (open ? 'detail-item detail-item--open' : 'detail-item') : undefined}>
      <dt>{t.current.airQuality}</dt>
      <dd>
        {hasPollutants(airQuality) ? (
          <button
            type="button"
            className="aqi detail"
            aria-expanded={open}
            aria-controls={panelId}
            title={scale}
            onClick={onToggle}
          >
            {value}
            <span className="visually-hidden">, {t.pollutants.title}</span>
            <ChevronIcon className="detail__chevron" />
          </button>
        ) : (
          <span className="aqi" title={scale}>
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

interface PanelProps {
  airQuality: AirQualityView;
  open: boolean;
  id: string;
}

/**
 * Pollutant concentrations, shown under the details when the item is expanded: a bar per
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
