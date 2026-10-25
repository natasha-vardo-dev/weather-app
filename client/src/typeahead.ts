/** Typed letters within this time add up ("ne" finds "Nederlands"), like a native select. */
export const TYPEAHEAD_RESET_MS = 500;

export interface Typed {
  text: string;
  /** When the last letter was typed (ms). */
  at: number;
}

export const NOTHING_TYPED: Typed = { text: '', at: -Infinity };

/** Adds a key to the typed text, starting over after a pause. */
export function addTyped(previous: Typed, key: string, now: number): Typed {
  const kept = now - previous.at > TYPEAHEAD_RESET_MS ? '' : previous.text;
  return { text: kept + key.toLowerCase(), at: now };
}

/** True while letters still add up, so a space belongs to the text rather than choosing. */
export function isTyping(typed: Typed, now: number): boolean {
  return now - typed.at <= TYPEAHEAD_RESET_MS;
}

/**
 * Index of the option to move to for the typed text, or `active` when nothing matches.
 * One letter, or the same letter again ("p", "p"), cycles through the options with that
 * letter, starting after the active one; different letters ("ne") narrow down from the
 * active one. Wraps around the end of the list.
 */
export function nextTypeaheadIndex(labels: readonly string[], active: number, typedText: string): number {
  const text = typedText.toLowerCase();
  if (!text) return active;
  const sameLetter = [...text].every((c) => c === text[0]);
  const query = sameLetter ? text[0] : text;
  const start = sameLetter ? active + 1 : active;
  for (let i = 0; i < labels.length; i++) {
    const index = (start + i) % labels.length;
    if (labels[index].toLowerCase().startsWith(query)) return index;
  }
  return active;
}
