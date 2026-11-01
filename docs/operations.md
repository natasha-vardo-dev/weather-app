# Operations

How the running app is watched, and what to do when an alert comes. Deployment itself is in the
[README](../README.md#deployment).

## Uptime monitoring and alerts

[UptimeRobot](https://uptimerobot.com) on its free plan (50 monitors, checks every 5 minutes, email and the mobile
app's push alerts). [Better Stack](https://betterstack.com/uptime) works the same way with the same monitors.
Nothing in the code depends on the service; the account is set up by hand.

| Monitor | Type    | URL                                | Alerts when                                           |
| ------- | ------- | ---------------------------------- | ----------------------------------------------------- |
| Site    | HTTP(s) | `https://<site>/`                  | the site (Vercel) does not answer 2xx                 |
| API     | Keyword | `https://<site>/api/health`        | the answer lacks `"proxied":true`                     |
| Quota   | HTTP(s) | `https://<site>/api/health/quota`  | a provider limit is used to 80% or more (answers 503) |
| Notify  | HTTP(s) | `https://<site>/api/health/notify` | no fully successful notifier run for 30 min (503)     |

All go through the site. The notify monitor exists only with push configured (Firebase); without it the path is 404,
so leave the monitor out. `/api/health` and `/api/health/quota` need no secret and are not rate limited, so a
plain status check of health would stay green even with `PROXY_SECRET` different on Vercel and Render, while every other
API call got 404. Health therefore says whether the request carried the right secret (`"proxied":true`), and the API
monitor is a keyword check for exactly that text, alerting when it is missing: one check covers the middleware,
`API_ORIGIN`, the API being up and the secret matching.

Set up:

1. Create an account; under "Integrations & Team", add an email alert contact and, optionally, the mobile app.
2. Add the monitors above, each every 5 minutes, with that contact. For the API monitor choose the keyword type,
   keyword `"proxied":true`, alert when the keyword is _not_ present.
3. For the site monitor, a keyword check for `Weather forecast` (the page title) also catches an empty page.

The monitors' requests keep the free Render instance awake, as the notification scheduler does. Both together still
fit in Render's free hours for one service.

## What an alert means

- **Site down:** Vercel status page, then the latest deployment in Vercel.
- **API alert:** open `https://<site>/api/health` and read the answer:
  - `500` with `API_ORIGIN is not set.`: the variable is missing on Vercel;
  - a 404 or another host's error page: `API_ORIGIN` points to the wrong place;
  - `"proxied":false`: `PROXY_SECRET` differs between Vercel and Render (every other API call gets 404);
  - no answer, `5xx` or `"status":"draining"` for long: Render's logs and events (a crash, a failed deploy, the
    instance not starting).
- **Quota:** the body names the provider, window (`perMinute`, `perHour`, `perDay`) and share used. At 90% the server
  itself refuses new calls to that provider (cached answers still go out, the rest gets `503 SERVICE_BUSY`), so the
  alert is the time to look: `GET /api/internal/metrics` with `Authorization: Bearer <METRICS_SECRET>` shows cache hit
  rates and calls per provider. A per-minute alert usually clears by itself; a daily one that repeats means the app has
  outgrown the free tier (see [ADR 0004](adr/0004-provider-limits.md)).

With push configured, the quota counters are saved to Firestore once a minute and restored at start
([ADR 0018](adr/0018-durable-operational-state.md)), so a restart loses at most a minute of counts. Without Firebase they
are in memory only and start from zero after every restart and deploy, so right after one the alert can come late.
The start's log line `operational state store` says which (`"store":"firestore"` or `"memory"`).

- **Notify:** open `https://<site>/api/health/notify`:
  - `lastRunAt` old or missing: the scheduler stopped calling (cron-job.org's job history), or every call failed: its
    answer and Render's log line `notifier run failed` say why;
  - `feedsFailed` lists the same countries for long: MeteoAlarm's feed for them is down or changed (open
    `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<country>`); warnings there are not pushed meanwhile;
  - `lastRejectedAt` within the last 30 minutes: FCM refused messages for good (log line `FCM refused messages for good` names the warning);
    usually a payload problem, a code fix;
  - `PERMISSION_DENIED` or `NOT_FOUND` from Firestore in the log: the database is not created or the service account
    lacks **Cloud Datastore User** (README, "Deployment"). Runs fail until fixed, rather than forgetting what was sent.

A server refusing to start with `Invalid configuration:` lists every setting to fix (`server/src/config.ts`); Render
keeps the previous deploy running meanwhile.

## Notification scheduler

[cron-job.org](https://cron-job.org) calls `POST /api/internal/alerts/notify` every 5 minutes (see the README). In the
job's settings, turn on "Notify on failure", so a failing run (FCM failing, every feed down, the state store
unavailable, the API down) reaches the same inbox. A run where only some feeds failed or FCM refused messages for good
answers 200 (the rest was sent); the notify monitor catches those when they last.

## Request budget of an open page

Warnings are the only thing an open page asks for by itself: once every 4 minutes per place shown, while the tab is
visible (`client/src/hooks/useAlerts.ts`). A start page with ten favourites left open in view is about 3,600 requests a
day through Vercel to Render, each answered from the server's feed cache (no MeteoAlarm call of its own). Forecasts and
air quality are not refreshed on an open page (the outdated-forecast notice covers that).

## Secrets

| Secret                     | Where             | Rotate                                                                      |
| -------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `PROXY_SECRET`             | Vercel and Render | set the new value on Render and Vercel together, redeploy both              |
| `ALERTS_NOTIFY_SECRET`     | Render, cron-job  | new value on Render, then in the cron-job.org job's header                  |
| `METRICS_SECRET`           | Render            | new value on Render                                                         |
| `FIREBASE_SERVICE_ACCOUNT` | Render            | new key in Google Cloud IAM, set it on Render, redeploy, delete the old key |

All are at least 32 random characters (`openssl rand -base64 32`); the server refuses shorter ones in production.
Rotate after anyone who knew one leaves, after a leak, and once a year. A leaked Firebase key is revoked by deleting it
in Google Cloud Console → IAM → Service accounts → Keys; the service account needs only **Firebase Cloud Messaging API
Admin** and **Cloud Datastore User**, nothing project-wide. Logs never print a secret; Render keeps them for its plan's
retention (7 days on the free plan) and only the project's members can read them.

## Dependency audit

CI fails on high or critical advisories in production dependencies (`npm audit --omit=dev`). The full audit (with
development tools) is reviewed when the weekly CI run is read; known exceptions, with the reason and when to look again:

| Advisory                                    | Path                                                    | Why it is accepted                                                                                               | Review     |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Zod memory exhaustion (GHSA-mrhx-c7xc-m3w5) | `@vercel/functions` → `@vercel/oidc` → … → `zod@4.1.11` | the middleware imports `@vercel/functions/middleware` only, which does not load that chain; our own Zod is 4.6.7 | 2027-01-31 |
| `minimatch`, `glob`, `deepmerge`            | build and test tools                                    | they read our own files and configuration, not user input                                                        | 2027-01-31 |

Do not run `npm audit fix --force`: it proposes downgrades by years. The `@grpc/grpc-js` override in `package.json`
goes when `firebase` depends on a fixed version itself.
