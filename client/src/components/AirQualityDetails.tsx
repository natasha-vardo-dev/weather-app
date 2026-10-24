import type { AirQualityView } from '../hooks/useAirQuality';
import { useI18n } from '../i18n/I18nProvider';

/** "More" icon: three dots. Decorative; the button text and aria-expanded carry the meaning. */
function DotsIcon() {
  return (
    <svg className="aqi__more" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

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
 * button that toggles the panel; without it, plain text, so it never opens an empty box.
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
    <div>
      <dt>{t.current.airQuality}</dt>
      <dd>
        {hasPollutants(airQuality) ? (
          <button
            type="button"
            className="aqi"
            aria-expanded={open}
            aria-controls={panelId}
            title={scale}
            onClick={onToggle}
          >
            {value}
            <span className="visually-hidden">, {t.pollutants.title}</span>
            <DotsIcon />
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

/** Pollutant concentrations, shown under the details when the item is expanded. */
export function PollutantsPanel({ airQuality, open, id }: PanelProps) {
  const { t, num } = useI18n();
  const { pollutants } = airQuality;
  const rows = [
    { code: 'PM2.5', name: 'PM2.5', value: pollutants.pm2_5 },
    { code: 'PM10', name: 'PM10', value: pollutants.pm10 },
    { code: 'O₃', name: t.pollutants.ozone, value: pollutants.ozone },
    { code: 'NO₂', name: t.pollutants.nitrogenDioxide, value: pollutants.nitrogenDioxide },
  ];

  return (
    <dl id={id} className="pollutants" aria-label={t.pollutants.title} hidden={!open}>
      {rows.map(
        (row) =>
          row.value !== null && (
            <div key={row.code}>
              <dt>
                {/* Formulas for the eye, full names for screen readers ("O₃" reads badly). */}
                <span aria-hidden="true">{row.code}</span>
                <span className="visually-hidden">{row.name}</span>
              </dt>
              <dd>
                {num(Math.round(row.value))} <span className="pollutants__unit">µg/m³</span>
              </dd>
            </div>
          ),
      )}
    </dl>
  );
}
