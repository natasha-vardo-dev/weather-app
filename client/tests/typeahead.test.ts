import { describe, expect, it } from 'vitest';
import { addTyped, isTyping, nextTypeaheadIndex, NOTHING_TYPED, TYPEAHEAD_RESET_MS } from '../src/typeahead';

// The language list order: Português comes before Polski.
const LANGUAGES = [
  'English',
  'Deutsch',
  'Français',
  'Español',
  'Italiano',
  'Português',
  'Nederlands',
  'Polski',
  'Русский',
];
const index = (label: string) => LANGUAGES.indexOf(label);

describe('nextTypeaheadIndex', () => {
  it('jumps to the next option starting with a letter', () => {
    expect(nextTypeaheadIndex(LANGUAGES, 0, 'p')).toBe(index('Português'));
  });

  it('cycles through options with the same letter when it is typed again', () => {
    expect(nextTypeaheadIndex(LANGUAGES, index('Português'), 'pp')).toBe(index('Polski'));
    expect(nextTypeaheadIndex(LANGUAGES, index('Polski'), 'ppp')).toBe(index('Português'));
  });

  it('narrows down with different letters, keeping the current option if it still matches', () => {
    expect(nextTypeaheadIndex(LANGUAGES, index('English'), 'ne')).toBe(index('Nederlands'));
    expect(nextTypeaheadIndex(LANGUAGES, index('Polski'), 'po')).toBe(index('Polski'));
  });

  it('wraps around the end of the list', () => {
    expect(nextTypeaheadIndex(LANGUAGES, index('Русский'), 'e')).toBe(index('English'));
  });

  it('ignores case and matches other scripts', () => {
    expect(nextTypeaheadIndex(LANGUAGES, 0, 'р')).toBe(index('Русский'));
    expect(nextTypeaheadIndex(LANGUAGES, 0, 'NE')).toBe(index('Nederlands'));
  });

  it('stays on the active option when nothing matches', () => {
    expect(nextTypeaheadIndex(LANGUAGES, 3, 'xyz')).toBe(3);
    expect(nextTypeaheadIndex(LANGUAGES, 3, '')).toBe(3);
  });
});

describe('addTyped', () => {
  it('adds letters typed in quick succession', () => {
    const first = addTyped(NOTHING_TYPED, 'N', 1000);
    expect(addTyped(first, 'e', 1000 + TYPEAHEAD_RESET_MS).text).toBe('ne');
  });

  it('starts over after a pause', () => {
    const first = addTyped(NOTHING_TYPED, 'n', 1000);
    expect(addTyped(first, 'e', 1000 + TYPEAHEAD_RESET_MS + 1).text).toBe('e');
  });
});

describe('isTyping', () => {
  it('is true only within the reset time of the last letter', () => {
    const typed = addTyped(NOTHING_TYPED, 'n', 1000);
    expect(isTyping(typed, 1000 + TYPEAHEAD_RESET_MS)).toBe(true);
    expect(isTyping(typed, 1000 + TYPEAHEAD_RESET_MS + 1)).toBe(false);
    expect(isTyping(NOTHING_TYPED, 0)).toBe(false);
  });
});
