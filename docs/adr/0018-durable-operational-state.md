# 0018. Operational state in Firestore, caches still in memory

- Status: Accepted (supersedes the "no database" part of [0011](0011-push-via-fcm-topics.md))
- Date: 2026-10-31

## Context

A production review (31 October 2026) found that two kinds of server state change behaviour when they are lost:

- **What the notifier has sent.** Kept in memory, it was lost on every restart and deploy. The first run after a
  start recorded the warnings in force without pushing them, so a warning issued while the server was down (a deploy,
  a crash, the free host's restart) was never pushed. Two overlapping instances during a deploy could both push.
- **Provider usage.** The budget that refuses calls near Open-Meteo's daily limit (ADR 0004) counted in memory, so a
  restart handed out a fresh daily allowance.

Forecast caches are different: losing them costs a few provider calls (ADR 0003). Everything must stay free and
non-commercial (ADR 0004), and push already depends on a Firebase project.

## Decision

A small `StateStore` (`server/src/services/stateStore.ts`): JSON documents by name, and a lease.

- With Firebase configured it is **Firestore** in the same project, through the same service account. One document
  per name in the `serverState` collection, the JSON gzipped into a bytes field (a document holds 1 MiB; warning URLs
  compress well). Without Firebase it is in memory, as before.
- The notifier reads its state at the start of every run and merges it into memory, then saves after each warning it
  sent and after every run, even a failed one, so a run cut by a deploy has recorded what it sent. Every run, not once
  per process: during a deploy two instances can take turns, and one working from its own memory would push again
  what the other sent. Merged, not replaced: after a failed save, memory holds what this instance sent and the store
  does not, and the store may meanwhile hold what the other instance sent; replacing either way pushes something again
  (both found by roborev). Entries leave only when their warning expires, so a union loses nothing. If reading fails,
  the run fails: starting empty would warm up silently and then overwrite what was saved. Unreadable saved state
  (another version, a damaged document) is ignored with a warning; a fresh process then warms up once, and its next
  save replaces the document.
- A lease (4 minutes, a Firestore transaction) keeps one notifier run at a time across instances; an instance that
  does not hold it skips the run.
- Provider usage (the per-minute buckets of the last day) is added back at start, then saved once a minute and at
  shutdown (awaited, at most 5 seconds, before the process exits). Nothing is saved until the saved counts were read
  back, retried every minute: a save before that would replace the last day's counts with the few since the start
  (found by roborev).
- Nothing about users is stored: warning identifiers, times, counts. Tokens stay in FCM's topics (ADR 0011).

## Consequences

- Warnings issued while the server was down are pushed on the next run; nothing is pushed twice after a restart.
- A restart no longer resets the provider budget.
- Firestore must be created in the Firebase project, and the service account needs the **Cloud Datastore User** role
  (README, "Deployment"). Verified live 2026-11-01 (`/api/health/notify` reports `"store":"firestore"`).
- About 2,600 writes (plus one per warning pushed) and 900 reads a day, within Firestore's free tier (20,000 writes, 50,000 reads).
- Rate limits per IP are still per instance and in memory: during a deploy's overlap each instance counts on its own.
  Acceptable with one instance; several instances would need a shared store (Redis, backlog).
- Saving once a minute can lose up to a minute of counts in a crash. During a deploy's overlap the new instance reads
  the counts once at start, and its saves then replace the old instance's last save: the old instance's calls after
  that read (seconds, at most a minute or two) are not counted. Merging the two would risk counting calls twice;
  the 10% margin under each limit (ADR 0004) covers the gap.

## Alternatives considered

- **Upstash Redis (free tier):** fits counters and leases well and is already in the backlog for the cache. But it is
  another provider holding our data, with its own account, terms and privacy-policy entry; Firestore comes with the
  Firebase project push needs anyway.
- **A file on Render's disk:** free instances have no persistent disk; files go with every deploy.
- **Stateless windows on the warning's `sent` time:** rejected before (ADR 0011): MeteoAlarm lists warnings minutes
  after `sent`.
- **Keep it in memory and accept the gaps:** a missed warning is the failure push exists to prevent.
