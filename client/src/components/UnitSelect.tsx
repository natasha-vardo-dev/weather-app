import { TEMPERATURE_UNITS, type TemperatureUnit } from '@weather/shared';
import { useI18n } from '../i18n/I18nProvider';
import { useUnits } from '../units/UnitProvider';
import { Dropdown } from './Dropdown';

const SYMBOLS: Record<TemperatureUnit, string> = { celsius: '°C', fahrenheit: '°F' };

const OPTIONS = TEMPERATURE_UNITS.map((value) => ({ value, label: SYMBOLS[value] }));

export function UnitSelect() {
  const { t } = useI18n();
  const { unit, setUnit } = useUnits();
  return <Dropdown label={t.temperatureUnit} value={unit} options={OPTIONS} onChange={setUnit} variant="unit" />;
}
