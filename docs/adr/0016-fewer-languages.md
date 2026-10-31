# 0016. Eight interface languages instead of nineteen

- Status: Accepted (supersedes the list of languages in [0008](0008-languages-and-units.md))
- Date: 2026-10-31

## Context

The interface had 19 languages, all machine-quality drafts that nobody had reviewed. An unreviewed translation looks
careless and, in a weather warning, can mislead. Every new string cost 19 translations. The app's distinctive feature,
official warnings, covers Europe only (see [0010](0010-meteoalarm-warnings.md)), so most of its audience is there.

## Decision

Keep English, German, French, Spanish, Italian, Polish, Ukrainian and Russian:

- English is the default and the fallback;
- German, French, Spanish and Italian cover the largest MeteoAlarm countries;
- Polish is the first audience (the author is in Poland), and reviewers are within reach;
- Ukrainian and Russian are widely spoken in Poland and the rest of Europe, and Russian can be reviewed by the author.

Removed: Portuguese, Dutch, Swedish, Czech, Turkish (smaller audiences that mostly read English), Arabic, Hebrew,
Hindi, Japanese, Korean and Chinese (audiences mostly outside the area with warnings, and the hardest to review).

The machinery stays: `Intl` formatting, the typed `Messages`, and right-to-left support (`isRtl`, the isolate around
temperatures, logical CSS properties). Adding a language back is one locale file and its entry in `MESSAGES`.

## Consequences

- A new string costs 8 translations; each can be reviewed by a native speaker before release.
- A saved choice of a removed language is ignored, and the system language (or English) is used.
- Right-to-left layout is no longer exercised by component or end-to-end tests; the formatters keep unit tests. Bringing
  back Arabic or Hebrew means bringing back an end-to-end check in that language.

## Alternatives considered

- Keep all 19 and mark them as drafts: cheaper now, but every feature keeps paying for 19.
- Decide from analytics after launch: better data, but the app would launch with unreviewed translations. Languages can
  still be added back when visitors ask for them.
