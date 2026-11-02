# Architecture decision records

Short records of the decisions that shape the project: what was decided, why, and what was rejected.
How each part works is in [architecture.md](../architecture.md), with no reasons; every reason, rejected option and
lesson from history is here. Records 0023–0031 hold the smaller decisions per area that architecture.md used to
explain inline (recorded on 2026-11-02).

A new record copies [template.md](template.md) and takes the next number. A record is not edited when the
decision changes: a new record supersedes it, and the old one's status says so.

| No.                                                    | Decision                                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| [0001](0001-backend-for-frontend.md)                   | A thin backend for frontend in front of every external API                                     |
| [0002](0002-monorepo-shared-contract.md)               | One repository with a shared contract package                                                  |
| [0003](0003-in-memory-cache.md)                        | In-memory cache-aside with request coalescing and stale data                                   |
| [0004](0004-provider-limits.md)                        | Free providers' limits are product requirements                                                |
| [0005](0005-hosting-same-origin-proxy.md)              | Vercel and Render, one origin through a proxy with a secret                                    |
| [0006](0006-place-urls-by-id.md)                       | Place URLs identified by GeoNames id                                                           |
| [0007](0007-favourites-in-browser.md)                  | Favourites stored in the browser, no accounts                                                  |
| [0008](0008-languages-and-units.md)                    | Languages and units on the client, without an i18n library                                     |
| [0009](0009-offline-pwa.md)                            | Installable app that shows the last forecast offline                                           |
| [0010](0010-meteoalarm-warnings.md)                    | Official warnings from MeteoAlarm, located by region borders                                   |
| [0011](0011-push-via-fcm-topics.md)                    | Push notifications through FCM topics, no database                                             |
| [0012](0012-api-versioning.md)                         | Versioned API with a checked contract                                                          |
| [0013](0013-current-location.md)                       | Location only on request, matched to a searched city                                           |
| [0014](0014-client-error-reporting.md)                 | Browser errors reported to our own endpoint, not Sentry                                        |
| [0015](0015-testing-strategy.md)                       | Tests against fakes; end-to-end on the production build                                        |
| [0016](0016-fewer-languages.md)                        | Eight interface languages instead of nineteen                                                  |
| [0017](0017-privacy-policy-and-own-font.md)            | A privacy policy in English, and the font served by the site                                   |
| [0018](0018-durable-operational-state.md)              | Operational state in Firestore, caches still in memory                                         |
| [0019](0019-api-on-oracle-free-vm.md)                  | The API on an Oracle Cloud free VM with its own address                                        |
| [0020](0020-api-on-aws-ec2.md)                         | The API on AWS EC2 with its own address, free at first only                                    |
| [0021](0021-no-native-apps-yet.md)                     | No native mobile apps for now: the installable site serves phones                              |
| [0022](0022-no-redis-while-one-instance.md)            | No Redis while the API runs as one instance                                                    |
| [0023](0023-cache-and-provider-budget-details.md)      | Cache details and layered protection of the provider's limits                                  |
| [0024](0024-server-hardening-observability-privacy.md) | Observability, privacy and hardening details of the API and site                               |
| [0025](0025-frontend-search-and-favourites-details.md) | Frontend details: links, styles, loading, same-named places and favourites                     |
| [0026](0026-push-delivery-details.md)                  | Push delivery details: ordering, retries, warm-up and the notification on the device           |
| [0027](0027-languages-units-and-charts-details.md)     | Language, unit, settings and detail-chart details                                              |
| [0028](0028-current-location-details.md)               | Current location: geolocation, naming and IP fallback details                                  |
| [0029](0029-pwa-and-offline-details.md)                | PWA details: saved copies on server errors, a banner tied to what is on screen, silent updates |
| [0030](0030-weather-warnings-details.md)               | Warning details: coast fallback, neighbour feeds, refresh on an open page, prominent placement |
| [0031](0031-api-testing-and-shared-package-details.md) | Details of API versioning, testing and the shared package                                      |
