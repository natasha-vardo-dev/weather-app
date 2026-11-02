# 0026. Push delivery details: ordering, retries, warm-up and the notification on the device

- Status: Accepted
- Date: 2026-11-02

## Context

This ADR records, after the fact, the reasoning that used to live in `docs/architecture.md` in "Push notifications
about warnings". Architecture now describes only how push works; the reasons, trade-offs and rejected options are kept
here. The main decisions have their own ADRs: FCM topics and no subscription store ([0011](0011-push-via-fcm-topics.md)),
what was sent kept in Firestore ([0018](0018-durable-operational-state.md)), MeteoAlarm as the source
([0010](0010-meteoalarm-warnings.md)), no native apps yet ([0021](0021-no-native-apps-yet.md)).

The forces:

- Only free services, and the server keeps no data about users. Subscriptions live in FCM topics and on the device.
- A missed warning is the failure push exists to prevent; a repeated one is noise.
- During a deploy two API instances can overlap and take turns running the notifier.
- Browsers punish pushes that show nothing: Chrome shows its own "site updated in the background", and Safari revokes
  subscriptions that receive pushes without a notification (after three).
- FCM limits a data payload to 4 KB.
- Several of the rules below came from a roborev review, along with a crash it found: a hook placed after the bell's
  early returns blanked the page once coverage arrived.

## Decision

- **The client keeps its own subscription list** in `localStorage`, since the server stores nothing: the device needs it
  to change or undo a subscription, renew it when its token changes, and name the place in a notification.
- **Join before leave, and remember failed leaves.** A broader old setting left subscribed would keep notifying even
  after turning off, so a failed leave is retried on the next change, on turning off and on the next start.
- **One queue for every subscription change.** Each change reads the state, waits on the network and writes it back: a
  token renewal on start finishing after a settings change would otherwise bring the old setting back. Retries run in
  the same queue, and a pending leave of the setting that is current again is dropped, since switching back must not
  leave the topic just joined. Every stored place moves to a new token before another is subscribed.
- **Unsubscribing an unknown token succeeds,** since it is on no topic, so notifications can always be turned off.
- **A lease per run, renewed during long runs.** A run after downtime with hundreds of new warnings could outlive the
  4-minute lease; renewing before each send once half has passed, and stopping if it was lost, keeps one run pushing.
- **State read at the start of every run and merged; a failed read fails the run.** Instances taking turns during a
  deploy never push what the other already sent, and a failed save never brings back an older record. Starting empty
  after a failed read would warm up silently and then overwrite the saved state ([0018](0018-durable-operational-state.md)).
- **Save after each warning and after every run; shutdown waits up to 5 seconds,** so a run cut by a deploy has
  already recorded what it sent.
- **Full texts loaded all at once.** One by one, a run with many new warnings took minutes.
- **Warm-up per source, not per run.** Without saved state, the first read of each feed only records the warnings in
  force, so nobody gets repeats. Per source, so a feed that failed on the first run, or a warning whose full text
  failed then, is not later pushed as new.
- **A warning counts as sent only once FCM accepted it,** one warning at a time. `sendEach` reports rejections per
  message instead of throwing, so network errors (`app/network-error`) would otherwise pass as success; recording an
  unsent warning as sent is worse than trying again. A failure retries just that warning and fails the run, so the
  scheduler shows it.
- **Permanent rejections are not retried but kept visible.** They would fail the same way again. Their time keeps
  `/api/health/notify` at 503 for 30 minutes, since later clean runs would otherwise hide them.
- **A run where every feed failed fails (502)** instead of reporting "no warnings".
- **A public notifier health check** (feed codes and times only, like quota) so an uptime monitor catches a scheduler
  that stopped, a feed down for long, or FCM refusing messages.
- **Payload trimmed by bytes.** The 160-character headline cap alone did not bound the payload: Cyrillic is two bytes a
  character, and issuers give up to ten languages. `fitPayload` counts UTF-8 bytes against 3,800 and drops the least
  needed parts first.
- **The broadcast path shares the page's cache** and parses each warning with its feed entry as fallback, so the page
  and the notification read one version.
- **One notification per warning; a closed one does not come back.** An update keeps the first version's key as the
  `tag` and is pushed again only if its level went up. A device in two areas may receive the same warning twice; the
  same tag replaces it quietly.
- **Data-only messages, written on the device** in the user's language from strings the page stored in IndexedDB.
- **Every push shows a notification,** with a plainer fallback from the message alone when the full one throws, because
  of Chrome's and Safari's behaviour above. Reading IndexedDB never rejects nor hangs for the same reason.
- **IndexedDB connections are closed once done:** an open one lasts as long as the page or the worker and would block a
  later version of the database (Safari waits on it).
- **The bell's panel locks while a change applies,** with a spinner on the control that started it and `aria-busy`.
  Disabling drops keyboard focus to the page, so focus is returned to the last used control when the lock ends.
  `latestOnly` still serialises changes, against a double click before the lock renders.
- **Defaults: storms, from orange.** Yellow warnings are common, e.g. fog across a country.
- **Permission asked only when the switch is turned on.**
- **The bell shows only where it can work, and only once coverage is known,** so it never flashes away; a place
  subscribed earlier keeps it so it can be turned off. In `npm run dev` the panel says up front that there is no
  service worker, instead of failing on the switch.
- **The Firebase SDK loads on demand** (~19 KB gzip), never in the main bundle.

- **A tap asks the open page to show the city** (added 2026-11-02): on an iPhone, with the app resumed from the
  background, `WindowClient.navigate()` left it on the city it showed before (Rhodes stayed open after tapping a
  warning for Warsaw). The page now gets a message and opens the city with its own router, then confirms; the
  worker navigates the window only without a confirmation within a second (an older page), and opens a new window
  last. It does not help on an iPhone with the app running (below).
- **Every step of a click has a time limit** (3 s), and focusing does not hold up opening the place: in Safari on a
  Mac a `focus()` that never settled, awaited first, left nothing opened and the click event unfinished, after which
  no more notifications came (2026-11-02).
- **The worker also records the page to open, and the app picks it up when it shows** (2026-11-02): with both
  changes above an iPhone still showed Rhodes when the app was running, while a closed app opened Warsaw. The reason
  assumed then, that iOS brings a running app forward without the message, `navigate()` or the URL of
  `openWindow()` reaching it, was disproved by the trace below: the click handler does not run at all. Storage was
  meant to reach the page whatever iOS does with windows. The record holds a path and a time, is used once,
  and is ignored after two minutes, so returning to the app later never jumps to an old warning's city. The worker
  logs which route it took, since a phone cannot be watched otherwise. It does not help on an iPhone either (below).
  Recording runs alongside focusing and opening a window, never before them (browsers allow those only shortly after
  the click), and a page already at the place does not navigate to it again, which would add a history entry and make
  Back seem broken (both found by roborev).
- **On an iPhone with the app running, a tap only brings the app forward; accepted for now** (2026-11-02). A
  temporary on-device trace of notification events (one hour, then reverted) showed the push handled and the page
  becoming visible two seconds later, but no `notificationclick` at all: iOS does not dispatch it to the worker
  while the installed app is running, so none of the routes above can act, the record included (it is written in
  that handler). A closed app is launched and does get the event, so it opens the city. The message route and the
  window fallbacks stay: on desktops they open the city in an open tab. The stored record is needed by no case seen:
  desktops are served by the message, a closed iPhone app by the launch, and a running one never runs the handler.
  It stays for now as an unverified fallback for a browser that brings a window forward without the message reaching
  it, at a cost of up to 500 ms waited in the click handler before messaging the page, a visibility listener and a
  second check a second after the page shows; remove it if it stays unneeded.
- **Possible next step, not built: a banner in the app ("option 1")**. On a push the worker would also remember the
  warning (place, level, kind, time). When the app comes into view shortly after one (about 10 minutes) on another
  place, a banner at the top of the page names the warning and offers to open its place: one more tap, but it never
  takes the user anywhere they did not ask to go, and it works whatever iOS does with windows. Shown once (gone after
  opening or closing it), never on the warning's own place. Three layouts were mocked on the real build at 390 px:
  A, a line in the style of the offline notice ("New warning for Warsaw: orange, wind", "Open"), compact but easy
  to miss; B, a card in the style of the warning cards (level stripe, "Orange warning: Wind · Warsaw", "New · until
  6:00 PM", "Open Warsaw", a close button), the clearest and the one recommended, at the cost of pushing the forecast
  down until closed; C, a toast fixed at the bottom ("Orange warning for Warsaw", "Open", close), which moves nothing
  but covers content and is harder for screen readers and keyboards. It needs new texts in the 8 languages and the
  worker to keep the last warning (a new stored item for the privacy page).

## Consequences

- On an iPhone with the installed app running, tapping a notification only brings the app forward on the place it
  showed; the user opens the warning's place themselves (until the banner of option 1 exists).
- Delivery problems surface in the scheduler (a failed run) and in `/api/health/notify` (503), not only in logs.
- A warning may be retried and so delayed by a run (5 minutes) when FCM fails; it is not lost or recorded as sent.
- A device in two areas can receive the same warning twice; the shared tag keeps one on screen.
- Some parts of a large warning (other languages, the area list, headlines) may be missing from the notification
  payload.
- Changing a setting takes a second or two during which the panel is locked.
- Not yet verified with a real warning; test pushes arrive in English.
- Native apps would need server changes: `apns`/`android` fields with localization keys, since iOS does not show a
  data-only message while the app is closed ([0021](0021-no-native-apps-yet.md)).

## Alternatives considered

- **`WindowClient.navigate()` only** (the first version): standard and enough on a desktop, but it did nothing on an
  iPhone for a resumed app.
- **Always a new window (`openWindow`)**: an installed app on a phone would stack copies of itself, or open the browser
  instead.
- **Opening the warning's place by itself when the app shows soon after a push and the notification is gone**: iOS
  does not tell a tap from swiping the notification away and then opening the app, so the second would move the user
  without asking.
- **Time windows on the warning's `sent` time** (stateless): MeteoAlarm lists a warning minutes after `sent`, so a fixed
  window would miss it.
- **Dropping a repeated warning on the device:** not possible; Chrome shows its own notification for a push that shows
  none, and Safari unsubscribes after three.
- **Loading full texts one by one:** a run after downtime took minutes.
- **Warm-up once per run:** a feed failing on the first run would later push old warnings as new.
- **Treating any FCM answer as sent:** `sendEach` does not throw on rejections, so failures would be recorded as sent.
- **A headline cap alone for the payload size:** does not bound bytes for Cyrillic and many languages.
- **Bell panel feedback:** a progress line with "Saving…" (19 more translations at the time); dimming alone (unclear
  what is happening).
