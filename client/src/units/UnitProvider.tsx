import { convertTemperature, defaultTemperatureUnit, TEMPERATURE_UNITS, type TemperatureUnit } from '@weather/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'temperature-unit';

/** An explicit choice wins; otherwise the default for the region of the system locale. */
function initialUnit(): TemperatureUnit {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (TEMPERATURE_UNITS as string[]).includes(saved)) return saved as TemperatureUnit;
  } catch {
    // Storage can be blocked (privacy mode): fall through to the regional default.
  }
  return defaultTemperatureUnit(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

interface Units {
  unit: TemperatureUnit;
  setUnit: (unit: TemperatureUnit) => void;
  /**
   * The API speaks Celsius; this gives the whole number to show in the chosen unit.
   * Converts first, then rounds: 14.4 °C is 58 °F, not round(14) -> 57 °F.
   */
  temp: (celsius: number) => number;
}

const UnitContext = createContext<Units | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<TemperatureUnit>(initialUnit);

  const setUnit = useCallback((next: TemperatureUnit) => {
    setUnitState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not saved, but the choice still applies for this visit.
    }
  }, []);

  const value = useMemo<Units>(
    () => ({ unit, setUnit, temp: (celsius) => Math.round(convertTemperature(celsius, unit)) }),
    [unit, setUnit],
  );

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnits(): Units {
  const units = useContext(UnitContext);
  if (!units) throw new Error('useUnits must be used inside UnitProvider');
  return units;
}
