/** Scripts written right to left among common languages. */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/** "pt-BR" -> "pt". */
export function baseLanguage(tag: string): string {
  return tag.split('-')[0].toLowerCase();
}

/**
 * First of the user's preferred languages (e.g. `navigator.languages`) that the app supports,
 * matched by base language so "de-AT" picks "de". Falls back when nothing matches.
 */
export function matchLanguage<T extends string>(preferred: readonly string[], supported: readonly T[], fallback: T): T {
  for (const tag of preferred) {
    const base = baseLanguage(tag) as T;
    if (supported.includes(base)) return base;
  }
  return fallback;
}

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.has(baseLanguage(language));
}
