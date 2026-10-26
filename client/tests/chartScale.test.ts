import { describe, expect, it } from 'vitest';
import { chartScale } from '../src/chartScale';

describe('chartScale', () => {
  it('keeps a fixed range for percentages', () => {
    expect(chartScale([10, 40], { fixed: [0, 100] })).toEqual({ lo: 0, hi: 100, ticks: [0, 50, 100] });
  });

  it('starts wind at zero with whole-number gridlines', () => {
    expect(chartScale([10.4, 23.7], { fromZero: true })).toEqual({ lo: 0, hi: 24, ticks: [0, 12, 24] });
    expect(chartScale([1, 2], { fromZero: true })).toEqual({ lo: 0, hi: 4, ticks: [0, 2, 4] });
  });

  it('fits temperatures, at least 4 degrees tall, so a flat day stays flat', () => {
    expect(chartScale([-3.2, 9.6])).toEqual({ lo: -4, hi: 10, ticks: [-4, 3, 10] });
    expect(chartScale([7.2, 7.8])).toEqual({ lo: 5, hi: 9, ticks: [5, 7, 9] });
  });

  it('ignores missing values and copes with none', () => {
    expect(chartScale([null, 5, null], { fromZero: true }).hi).toBe(6);
    expect(chartScale([])).toEqual({ lo: 0, hi: 4, ticks: [0, 2, 4] });
  });
});
