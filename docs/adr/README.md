# Architecture decision records

Short records of the decisions that shape the project: what was decided, why, and what was rejected.
How each part works is in [architecture.md](../architecture.md), with no reasons; every reason, rejected option and
lesson from history is here. Start with the decisions; the design notes below hold the smaller choices
per area. Each record's own status line has its full history.

A new record copies [template.md](template.md) and takes the next number. A record is not edited when the
decision changes: a new record supersedes it, and the old one's status says so.

## Decisions

| No.                                         | Decision                                                          | Status                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-backend-for-frontend.md)        | A thin backend for frontend in front of every external API        | Accepted                                                                                                              |
| [0002](0002-monorepo-shared-contract.md)    | One repository with a shared contract package                     | Accepted                                                                                                              |
| [0003](0003-in-memory-cache.md)             | In-memory cache-aside with request coalescing and stale data      | Accepted; Redis deferred by [0022](0022-no-redis-while-one-instance.md)                                               |
| [0004](0004-provider-limits.md)             | Free providers' limits are product requirements                   | Accepted                                                                                                              |
| [0005](0005-hosting-same-origin-proxy.md)   | Vercel and Render, one origin through a proxy with a secret       | Render part superseded by [0019](0019-api-on-oracle-free-vm.md), then [0020](0020-api-on-aws-ec2.md); the proxy stays |
| [0006](0006-place-urls-by-id.md)            | Place URLs identified by GeoNames id                              | Accepted                                                                                                              |
| [0007](0007-favourites-in-browser.md)       | Favourites stored in the browser, no accounts                     | Accepted                                                                                                              |
| [0008](0008-languages-and-units.md)         | Languages and units on the client, without an i18n library        | Language list superseded by [0016](0016-fewer-languages.md)                                                           |
| [0009](0009-offline-pwa.md)                 | Installable app that shows the last forecast offline              | Accepted                                                                                                              |
| [0010](0010-meteoalarm-warnings.md)         | Official warnings from MeteoAlarm, located by region borders      | Accepted                                                                                                              |
| [0011](0011-push-via-fcm-topics.md)         | Push notifications through FCM topics, no database                | "No database" superseded by [0018](0018-durable-operational-state.md)                                                 |
| [0012](0012-api-versioning.md)              | Versioned API with a checked contract                             | Accepted                                                                                                              |
| [0013](0013-current-location.md)            | Location only on request, matched to a searched city              | Accepted                                                                                                              |
| [0014](0014-client-error-reporting.md)      | Browser errors reported to our own endpoint, not Sentry           | Accepted                                                                                                              |
| [0015](0015-testing-strategy.md)            | Tests against fakes; end-to-end on the production build           | Partly superseded by [0031](0031-api-testing-and-shared-package-details.md)                                           |
| [0016](0016-fewer-languages.md)             | Eight interface languages instead of nineteen                     | Accepted                                                                                                              |
| [0017](0017-privacy-policy-and-own-font.md) | A privacy policy in English, and the font served by the site      | Accepted                                                                                                              |
| [0018](0018-durable-operational-state.md)   | Operational state in Firestore, caches still in memory            | Accepted                                                                                                              |
| [0019](0019-api-on-oracle-free-vm.md)       | The API on an Oracle Cloud free VM with its own address           | Superseded by [0020](0020-api-on-aws-ec2.md)                                                                          |
| [0020](0020-api-on-aws-ec2.md)              | The API on AWS EC2 with its own address, free at first only       | Accepted                                                                                                              |
| [0021](0021-no-native-apps-yet.md)          | No native mobile apps for now: the installable site serves phones | Accepted                                                                                                              |
| [0022](0022-no-redis-while-one-instance.md) | No Redis while the API runs as one instance                       | Accepted                                                                                                              |
| [0032](0032-dependabot-into-main.md)        | Dependency updates go straight into main                          | Accepted                                                                                                              |

## Design notes

The smaller decisions per area, collected after the fact on 2026-11-02 from what architecture.md used to explain
inline. Read the one for the area you change.

| No.                                                    | Area                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [0023](0023-cache-and-provider-budget-details.md)      | Cache details and layered protection of the provider's limits                                  |
| [0024](0024-server-hardening-observability-privacy.md) | Observability, privacy and hardening details of the API and site                               |
| [0025](0025-frontend-search-and-favourites-details.md) | Frontend details: links, styles, loading, same-named places and favourites                     |
| [0026](0026-push-delivery-details.md)                  | Push delivery details: ordering, retries, warm-up and the notification on the device           |
| [0027](0027-languages-units-and-charts-details.md)     | Language, unit, settings and detail-chart details                                              |
| [0028](0028-current-location-details.md)               | Current location: geolocation, naming and IP fallback details                                  |
| [0029](0029-pwa-and-offline-details.md)                | PWA details: saved copies on server errors, a banner tied to what is on screen, silent updates |
| [0030](0030-weather-warnings-details.md)               | Warning details: coast fallback, neighbour feeds, refresh on an open page, prominent placement |
| [0031](0031-api-testing-and-shared-package-details.md) | Details of API versioning, testing and the shared package                                      |
