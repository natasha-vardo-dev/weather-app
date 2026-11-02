# 0021. No native mobile apps for now: the installable site serves phones

- Status: Accepted
- Date: 2026-11-01

## Context

iOS and Android apps were requested, mainly for warning notifications on phones. Web push works
end to end ([0011](0011-push-via-fcm-topics.md)) on a desktop (Chrome, Safari, Firefox),
on Android in a Chrome tab, and on an iPhone from the Home Screen app (iOS 16.4+), together with the scheduler and
a tap opening the city page. So the site already does on phones what the apps were wanted for.

Native apps would cost:

- Money: $99 a year for the Apple Developer Program and $25 once for Google Play, a second exception to "free only"
  after [0020](0020-api-on-aws-ec2.md). Without them an Android APK can be installed by hand, but an iOS build runs
  only on the developer's own phone, for 7 days, and without push (push needs the paid program).
- Work: a second interface (the screens, components and the chart) with its own tests; the 8 languages
  could be shared ([0016](0016-fewer-languages.md)), as could `@weather/shared` ([0002](0002-monorepo-shared-contract.md)).
- Server changes for push: an APNs key in Firebase, and `apns`/`android` fields with localization keys, since iOS
  does not show a data-only message while the app is closed (the web keeps data-only messages).
- Store reviews, privacy forms, and for a new personal Google Play account a closed test (at the time, 12 testers for
  14 days) before release.
- A harder API to change: an app's old versions run for months ([0012](0012-api-versioning.md)).

What only apps give: home and lock screen widgets (the main thing a site cannot do for weather), presence in the
stores where people look for weather apps, and installation without the iPhone's manual "Share → Add to Home Screen".

## Decision

- No native apps for now. Phones use the installable site: push in the browser on Android, from the Home Screen on
  iOS (the start page explains it, [0009](0009-offline-pwa.md)).
- Measure first: the cookie-free analytics in the backlog are to show the share of iPhone visitors, how many install
  the site and how many turn notifications on.
- Reconsider when one of these holds: users ask for widgets; many iPhone visitors but few installs; the stores are
  needed to reach people. Then the plan is React Native with Expo, reusing `shared` and the translations, the API
  through the same proxy (the secret stays on Vercel), push to the same FCM topics, and widgets in Swift and Kotlin.
- If Google Play alone is wanted first: the site as a Trusted Web Activity ($25 once, almost no new code; push works as
  in Chrome).

## Consequences

- No new costs, no second interface to keep in step, no app versions to support.
- iPhone users must add the site to the Home Screen themselves to get notifications.
- No widgets, and no listing in the App Store or Google Play.
- `shared` keeps its rule of running unchanged in React Native, so the door stays open.

## Alternatives considered

- **React Native with Expo now:** the best fit if apps are wanted (reuses `shared`), but costs the fees, a second
  interface and the server changes above for what the site already does.
- **Capacitor (the site in a native shell):** one interface, but web push does not work in the shell's WebView (a
  native plugin is needed anyway), and Apple often rejects apps that are a website in a wrapper (guideline 4.2).
- **Swift and Kotlin:** the best result, but two more code bases with no reuse of `shared`.
- **Apps without the stores:** an Android APK works, push included; on iOS a free account allows only the
  developer's own phone, 7 days at a time, without push.
