# 0017. A privacy policy in English, and the font served by the site

- Status: Accepted
- Date: 2026-10-31

## Context

The audience is European, so the GDPR applies: people must be told what is collected, why, and who receives it. The
app keeps little (no accounts, cookies or analytics), but data does reach other services: places and searches go to
Open-Meteo and Nominatim through our server, the IP address to ipwho.is in one case, device tokens to Firebase. The
font came from Google Fonts, which sent every visitor's IP address to Google on each visit; a German court found that
against the GDPR (LG München I, 3 O 17493/20, 2022).

## Decision

- A privacy policy at `/privacy`, linked from the footer, loaded on demand. It describes what the code does, flow by
  flow, and changes with it.
- In English only; the footer link is translated.
- Contact through the project's public issue tracker.
- The font (`@fontsource-variable/bricolage-grotesque`, same axes) is part of the build and precached by the service
  worker; the Content-Security-Policy lists no Google hosts except Firebase's.

## Consequences

- No visitor data goes to Google unless notifications are turned on.
- Every new service that receives user data, or new data kept, means editing the policy.
- The policy is a draft written from the code, not legal advice; it should be read by someone who knows data
  protection law before release.
- Readers of other languages get an English legal text.

## Alternatives considered

- Translating the policy into all 8 languages: 8 unreviewed legal texts; worse than one reviewed version.
- Keeping Google Fonts with a consent banner: a banner for a font is out of proportion, and the risk remains until
  consent.
- A generated policy from an online generator: generic, and it would not match the actual data flows.
