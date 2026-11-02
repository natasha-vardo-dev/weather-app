# Backlog

What comes next, in order. The README's "Next steps" is the short version of this list; this file is the
one to edit. Something started gets an issue or a pull request; something decided gets an ADR
([adr/README.md](adr/README.md)).

## 1. Release

- **Deploy the API from `main` automatically** (GitHub Actions over SSH to the VM, `deploy/vm/deploy.sh`). Deploys
  are manual now ([deploy-aws.md](deploy-aws.md#updating-and-rolling-back)).
- **Tag deploys automatically** as part of the automatic deploy; now the tag is set by hand after each deploy
  ([CONTRIBUTING](../CONTRIBUTING.md#branches-and-merging)).
- **A named security contact** in [SECURITY.md](../SECURITY.md) besides GitHub's private reporting.
- **Decide about the API host before the AWS free plan ends:** upgrade to the paid plan, or move
  ([ADR 0020](adr/0020-api-on-aws-ec2.md)).

## 2. Reliability

- **A second forecast source** (MET Norway) behind `WeatherProvider`, for when Open-Meteo fails or its free limits are
  outgrown ([ADR 0004](adr/0004-provider-limits.md)).
- **Redis for the cache and rate limits only with a second API instance**
  ([ADR 0022](adr/0022-no-redis-while-one-instance.md)). If restarts become costly first (after automatic deploys),
  write the cache to disk on shutdown before that.

## 3. Maintainability

- **A coverage threshold** in Vitest, so coverage cannot drift down unnoticed.
- **Branch protection on `main`:** CI required, no direct pushes.
- **Translations by native speakers:** the 8 locales are machine translations
  ([ADR 0016](adr/0016-fewer-languages.md)).

## 4. Product

- **An in-app notice for a new warning on an iPhone** when the app is open on another city: variant 1, mock-ups A/B/C,
  B recommended ([ADR 0026](adr/0026-push-delivery-details.md)). iOS does not pass a notification tap to the service
  worker while the app is running.
- **A wind unit setting** (km/h, m/s, mph); only temperature has one now.
- **Accounts**, so favourites sync between devices ([ADR 0007](adr/0007-favourites-in-browser.md) describes the path).
- **SEO:** static pages for popular cities (SSG), since the SPA has nothing to index.
- **Cookie-less analytics** (page views by country and device): also the data for deciding about native mobile apps
  ([ADR 0021](adr/0021-no-native-apps-yet.md)).
- **More end-to-end scenarios:** push notifications and the service worker's update to a new version
  ([Testing](architecture.md#testing)).
