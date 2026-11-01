# 0019. The API on an Oracle Cloud free VM with its own address, not Render

- Status: Superseded by [0020](0020-api-on-aws-ec2.md) (the host; the VM set-up stays, scripts now in `deploy/vm`)
- Date: 2026-11-01

## Context

The first deploy to free Render (1 November 2026) worked, but every forecast failed: Open-Meteo answered
`HTTP 429 "Daily API request limit exceeded"` minutes after the server started, having had a handful of our calls.
Open-Meteo counts its free limits (600 a minute, 5,000 an hour, 10,000 a day) per IP address, and free Render sends
every app in a region out through a few shared addresses: other apps had used the day's allowance. Geocoding and air
quality still answered (they are separate services with their own counters), but are open to the same problem.

[ADR 0004](0004-provider-limits.md) counted the limits as ours alone, and our own budget (`Metrics.budget`,
`/api/health/quota`) cannot see calls made by others from the same address. Hosting must stay free (CLAUDE.md).

## Decision

- The API runs on an **Oracle Cloud Always Free VM** (Ubuntu 24.04; Ampere A1 or the AMD micro shape), which has a
  public IP address of its own: Open-Meteo's per-address limits are then ours, and the budget of ADR 0004 is right.
- **Node 24 under systemd** (`deploy/oracle/weather-api.service`), listening on 127.0.0.1 only, with **Caddy** in
  front for HTTPS (a Let's Encrypt certificate it renews itself). The host name is `<ip-with-dashes>.sslip.io`, which
  resolves to the address with no domain to buy.
- Vercel and the proxy with a secret stay as in [ADR 0005](0005-hosting-same-origin-proxy.md); only `API_ORIGIN`
  changes. `TRUST_PROXY=1`: Caddy is the one proxy in front of the server.
- `deploy/oracle/setup.sh` prepares a fresh VM once (swap, firewall, Node, Caddy, a service user, the unit);
  `deploy/oracle/deploy.sh` builds a commit in a directory of its own and switches to it, so a failed build leaves the
  running server alone, and an earlier build can be deployed again at once (a rollback). Steps:
  docs/deploy-oracle.md (since replaced by [docs/deploy-aws.md](../deploy-aws.md)).

## Consequences

- Open-Meteo's limits and our budget agree. If 429s still come, the cause is our own traffic, which the quota monitor
  sees first.
- No sleeping and no cold start: the minute-long wake-up that ADR 0005 and [ADR 0009](0009-offline-pwa.md) worked
  around is gone, and the scheduler no longer needs to keep the server awake (it still runs the notifier).
- We run the machine: security updates (unattended-upgrades, extended by setup.sh to Node's and Caddy's repositories,
  with needrestart restarting the services that use an upgraded binary), disk, and reboots. A deploy is
  manual (`ssh` and `deploy.sh`) until the backlog's automatic deploy; a restart is a few seconds without the API.
- Oracle may reclaim an Always Free instance that stays idle for 7 days (CPU, network and memory under 20%). Our
  load is tiny, so the account should be upgraded to Pay As You Go, which keeps Always Free resources free and is not
  reclaimed; a budget alert at a small amount guards against a paid resource created by mistake.
- One machine, one region: an Oracle outage takes the API down (the site and offline forecasts stay). The quota
  counters and the notifier's state are in Firestore ([ADR 0018](0018-durable-operational-state.md)), so a rebuilt VM
  continues where the old one stopped.
- sslip.io is a free third-party service: if it went away, the API's host name would stop resolving. A domain of our
  own (or a free DuckDNS name) replaces it by changing the Caddyfile and `API_ORIGIN`.

## Alternatives considered

- **Staying on Render:** its free outgoing addresses are shared; nothing on the free plan changes that.
- **Google Cloud Run:** free tier, fast start, same Google project as Firebase; but its outgoing addresses are
  Google's shared pool too (a fixed one needs a paid NAT), and the in-memory cache goes with every scale to zero.
- **Koyeb, Fly.io and similar platforms:** shared outgoing addresses on free plans, or no free plan.
- **A paid Open-Meteo plan with an API key:** limits per key, but paid, against the project's constraints.
- **Calling Open-Meteo from the browser:** each user's own address and limit, but no shared cache, no checking of the
  answers and no budget, and every user's address goes to Open-Meteo ([ADR 0001](0001-backend-for-frontend.md)).
- **A second forecast source (MET Norway):** still planned against Open-Meteo outages, but it does not fix the
  shared address for geocoding and air quality.
- **Docker (Compose with Caddy) on the VM:** pins Node and isolates the app, but adds a layer and memory on the 1 GB
  shape, and could not be built where this was prepared; systemd's sandboxing covers the isolation that matters here.
