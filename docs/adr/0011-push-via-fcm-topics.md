# 0011. Push notifications through FCM topics, no database

- Status: Accepted (end-to-end delivery not yet verified); keeping what was sent in memory superseded by [0018](0018-durable-operational-state.md)
- Date: 2026-10-31 (recorded)

## Context

Users want to hear about a warning without opening the app. There is no database and no paid service, and the free
server restarts and sleeps.

## Decision

- Subscriptions are Firebase Cloud Messaging topics: `AREA.storm|all.yellow|orange|red`, where the area is a MeteoAlarm
  region or a 0.25° grid cell. `POST /api/v1/push/topics` subscribes the device's token; the server stores nothing.
  The device keeps its own list to change, undo and renew it.
- An external scheduler (cron-job.org, every 5 minutes) calls `POST /api/internal/alerts/notify` with a secret.
  `AlertNotifier` remembers in memory what it sent until each warning ends; after a restart the first read of each feed
  is only recorded, not pushed.
- Data-only messages; the service worker writes the notification in the user's language from strings the page stored
  in IndexedDB.
- `firebase-admin` 14 needs the **Firebase Cloud Messaging API Admin** role on the service account in Google Cloud IAM;
  without it subscribing fails with `messaging/authentication-error`.

## Consequences

- Warnings issued while the server was down are not pushed.
- Delivery depends on the scheduler; a failed send fails the run and is retried on the next one.
- Tests replace Firebase, so CI cannot tell whether notifications work: check live after any Firebase SDK update.

## Alternatives considered

- Periodic Background Sync: Chromium only and at most every few hours.
- Subscriptions in server memory: lost on every restart.
- Web Push with our own subscription store: needs a database.
