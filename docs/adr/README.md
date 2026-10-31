# Architecture decision records

Short records of the decisions that shape the project: what was decided, why, and what was rejected.
The details of how each part works are in [architecture.md](../architecture.md); these records keep the reasoning
in one place per decision.

A new record copies [template.md](template.md) and takes the next number. A record is not edited when the
decision changes: a new record supersedes it, and the old one's status says so.

| No.                                       | Decision                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| [0001](0001-backend-for-frontend.md)      | A thin backend for frontend in front of every external API   |
| [0002](0002-monorepo-shared-contract.md)  | One repository with a shared contract package                |
| [0003](0003-in-memory-cache.md)           | In-memory cache-aside with request coalescing and stale data |
| [0004](0004-provider-limits.md)           | Free providers' limits are product requirements              |
| [0005](0005-hosting-same-origin-proxy.md) | Vercel and Render, one origin through a proxy with a secret  |
| [0006](0006-place-urls-by-id.md)          | Place URLs identified by GeoNames id                         |
| [0007](0007-favourites-in-browser.md)     | Favourites stored in the browser, no accounts                |
| [0008](0008-languages-and-units.md)       | Languages and units on the client, without an i18n library   |
| [0009](0009-offline-pwa.md)               | Installable app that shows the last forecast offline         |
| [0010](0010-meteoalarm-warnings.md)       | Official warnings from MeteoAlarm, located by region borders |
| [0011](0011-push-via-fcm-topics.md)       | Push notifications through FCM topics, no database           |
| [0012](0012-api-versioning.md)            | Versioned API with a checked contract                        |
| [0013](0013-current-location.md)          | Location only on request, matched to a searched city         |
| [0014](0014-client-error-reporting.md)    | Browser errors reported to our own endpoint, not Sentry      |
| [0015](0015-testing-strategy.md)          | Tests against fakes; end-to-end on the production build      |
| [0016](0016-fewer-languages.md)           | Eight interface languages instead of nineteen                |
