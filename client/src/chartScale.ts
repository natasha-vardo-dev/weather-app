/** Y range and the three gridline values of a small chart. */
export interface ChartScale {
  lo: number;
  hi: number;
  ticks: [number, number, number];
}

/**
 * A y range with whole-number gridlines at bottom, middle and top.
 * - `fixed` (e.g. 0–100 for percentages): always that range, so 40% looks like 40%.
 * - `fromZero` (wind): starts at 0, so a breeze doesn't look like a storm.
 * - otherwise (temperature): fits the data, at least 4 units tall, so a flat day
 *   doesn't turn 1° of change into a cliff.
 * The middle line is a whole number: the step is rounded up and the top follows.
 */
export function chartScale(
  values: readonly (number | null)[],
  options: { fixed?: [number, number]; fromZero?: boolean } = {},
): ChartScale {
  if (options.fixed) {
    const [lo, hi] = options.fixed;
    return { lo, hi, ticks: [lo, (lo + hi) / 2, hi] };
  }
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  let lo = options.fromZero ? 0 : Math.floor(Math.min(...known, Infinity));
  let hi = Math.ceil(Math.max(...known, -Infinity));
  if (!known.length) [lo, hi] = [0, 4];
  if (hi - lo < 4) {
    if (options.fromZero) hi = 4;
    else {
      // Centred on the data, so a flat line sits in the middle, not at the edge.
      lo = Math.floor((Math.min(...known) + Math.max(...known)) / 2 - 2);
      hi = lo + 4;
    }
  }
  const step = Math.ceil((hi - lo) / 2);
  return { lo, hi: lo + 2 * step, ticks: [lo, lo + step, lo + 2 * step] };
}
