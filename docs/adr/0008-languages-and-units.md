# 0008. Languages and units on the client, without an i18n library

- Status: Accepted; the list of languages superseded by [0016](0016-fewer-languages.md)
- Date: 2026-10-31 (recorded)

## Context

The app supports 19 languages (en, de, fr, es, it, pt, nl, pl, cs, uk, ru, sv, tr, ar, he, hi, ja, ko, zh), two of them
right to left, and °C or °F. Translating on the server would multiply cache keys and provider calls.

## Decision

- The API has no language except where the provider needs one (place names): it returns condition keys and error
  codes, the client translates them.
- One typed file per language (`client/src/i18n/locales/*.ts`); the `Messages` type makes a missing key a compile
  error. Plurals, dates, times, numbers and units go through `Intl`, so they are correct for any locale.
- Default language: the first supported one in `navigator.languages`, else English; an explicit choice is stored and
  wins.
- `<html lang dir>` follows the language; CSS uses logical properties; temperatures are isolated in right-to-left text.
- Temperatures stay in °C in the API and the caches; the client converts and then rounds. °F is the default only when
  both the locale's region and the device's time zone are in a °F country.

## Consequences

- No library code; every new UI string costs 19 translations.
- The translations are drafts; they need native speakers before they can be called done.
- All languages are in the bundle (about 15 KB gzipped).

## Alternatives considered

- i18next or FormatJS: more than needed when `Intl` covers formatting.
- °F from the locale alone: many browsers report `en-US` whatever the region, so a user in Warsaw got °F.
