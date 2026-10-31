# Operations

How the running app is watched, and what to do when an alert comes. Deployment itself is in the
[README](../README.md#deployment).

## Uptime monitoring and alerts

[UptimeRobot](https://uptimerobot.com) on its free plan (50 monitors, checks every 5 minutes, email and the mobile
app's push alerts). [Better Stack](https://betterstack.com/uptime) works the same way with the same three monitors.
Nothing in the code depends on the service; the account is set up by hand.

| Monitor | Type    | URL                               | Alerts when                                           |
| ------- | ------- | --------------------------------- | ----------------------------------------------------- |
| Site    | HTTP(s) | `https://<site>/`                 | the site (Vercel) does not answer 2xx                 |
| API     | Keyword | `https://<site>/api/health`       | the answer lacks `"proxied":true`                     |
| Quota   | HTTP(s) | `https://<site>/api/health/quota` | a provider limit is used to 80% or more (answers 503) |

All three go through the site. `/api/health` and `/api/health/quota` need no secret and are not rate limited, so a
plain status check of health would stay green even with `PROXY_SECRET` different on Vercel and Render, while every other
API call got 404. Health therefore says whether the request carried the right secret (`"proxied":true`), and the API
monitor is a keyword check for exactly that text, alerting when it is missing: one check covers the middleware,
`API_ORIGIN`, the API being up and the secret matching.

Set up:

1. Create an account; under "Integrations & Team", add an email alert contact and, optionally, the mobile app.
2. Add the three monitors above, each every 5 minutes, with that contact. For the API monitor choose the keyword type,
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

The quota counters are in the server's memory: they start from zero after every restart and deploy, so right after one
the alert can come late.

## Notification scheduler

[cron-job.org](https://cron-job.org) calls `POST /api/internal/alerts/notify` every 5 minutes (see the README). In the
job's settings, turn on "Notify on failure", so a failing run (FCM refusing messages, the API down) reaches the same
inbox.
