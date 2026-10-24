type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type Plural = (n: number, forms: Forms) => string;

/**
 * Picks the plural form with the language's own rules (Intl.PluralRules):
 * Russian has one/few/many, Arabic six forms, Japanese one.
 * "{n}" is replaced by the number formatted for the locale.
 */
export function pluralize(locale: string, num: (n: number) => string = String): Plural {
  const rules = new Intl.PluralRules(locale);
  return (n, forms) => (forms[rules.select(n)] ?? forms.other).replace('{n}', num(n));
}
