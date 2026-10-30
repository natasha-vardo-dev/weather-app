import { screen } from '@testing-library/react';
import { formatHour } from '@weather/shared';
import { describe, expect, it } from 'vitest';
import { OutdatedNotice } from '../../src/components/OutdatedNotice';
import { forecast, warsaw } from '../fixtures/weather';
import { renderWithApp } from './render';

const HOUR = 60 * 60 * 1000;

describe('OutdatedNotice', () => {
  it('says nothing about a fresh forecast, in a live region that is already there', () => {
    renderWithApp(<OutdatedNotice forecast={forecast(warsaw)} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it("names the old forecast's time, as the hourly strip writes it", () => {
    const old = forecast(warsaw, { now: new Date(Date.now() - 2 * HOUR) });
    renderWithApp(<OutdatedNotice forecast={old} />);
    const time = formatHour(old.current.time, 1, { locale: 'en' }); // "9:15 PM" in English
    expect(screen.getByRole('status')).toHaveTextContent(
      new RegExp(`^Forecast last updated: (yesterday )?${time}\\.$`),
    );
  });

  it('names the day when it was not today', () => {
    const old = forecast(warsaw, { now: new Date(Date.now() - 30 * HOUR) });
    renderWithApp(<OutdatedNotice forecast={old} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Forecast last updated: (yesterday|\w{3}) \d/);
  });

  it('gives way to the offline banner', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      renderWithApp(<OutdatedNotice forecast={forecast(warsaw, { now: new Date(Date.now() - 2 * HOUR) })} />);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    }
  });
});
