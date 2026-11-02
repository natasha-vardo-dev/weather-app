# 0020. The API on AWS EC2 with its own address, free for the first months only

- Status: Accepted (supersedes the host choice of [0019](0019-api-on-oracle-free-vm.md))
- Date: 2026-11-01

## Context

[ADR 0019](0019-api-on-oracle-free-vm.md) moved the API off Render, whose shared outgoing addresses had used up
Open-Meteo's per-address limits, to an Oracle Cloud Always Free VM. Signing up showed its costs:

- An Always Free account's instance is stopped when it stays idle for 7 days (CPU, network and memory under 20%), and
  this API is that idle. Avoiding it means upgrading to Pay As You Go, which places a hold on the card.
- Oracle turns many cards down, and the Ampere shapes are often out of capacity.

AWS was chosen instead (1 November 2026); it is free only for the first months.

## Decision

- The API runs on an **AWS EC2** instance in an EU region (Stockholm `eu-north-1` by default, or Frankfurt
  `eu-central-1`): **t4g.micro** (ARM, 1 GB) or t3.micro, Ubuntu 24.04, with an **Elastic IP**, so the address,
  and the `<ip>.sslip.io` host name built from it, stay the same across stops and starts.
- The security group allows 80 and 443 from anywhere and SSH (22) only from the administrator's address.
- Everything on the machine is as decided in 0019, with the scripts moved from `deploy/oracle` to `deploy/vm`, since
  they do not depend on the provider: Node 24 under systemd on 127.0.0.1, Caddy for HTTPS, `setup.sh` once,
  `deploy.sh` for each deploy with rollback. Steps: [docs/deploy-aws.md](../deploy-aws.md).
- The free plan ends with the account suspended, not with a charge, so its end date is noted when the account is
  opened, and before it the plan is upgraded or the API moved. A zero-spend budget warns of charges after an
  upgrade.

## Consequences

- **An exception to "free only" (CLAUDE.md).** New AWS accounts get a free plan with credits for 6 months. After that the
  instance, its public IPv4 address and its disk are charged at the AWS prices of the time, or the account is closed. Open-Meteo's free plan
  stays non-commercial use only, which paying for hosting does not change.
- No idle reclamation, no sleeping: the API is up as long as the instance runs.
- Open-Meteo's limits are ours (the address is ours), as in 0019.
- The machine is run as in 0019 (updates are automatic, deploys manual).
- AWS is a US company: the privacy policy now names Amazon Web Services as the server's host, in place of Oracle, and
  lists it among the transfers under the EU–US Data Privacy Framework.

## Alternatives considered

- **Oracle Cloud Always Free (0019):** free for good, but stopped when idle unless upgraded to Pay As You Go, with a
  $100 hold and frequent card and capacity problems at sign-up.
- **Render (0005):** shared outgoing addresses; Open-Meteo refused every forecast.
- **AWS Lightsail:** a fixed monthly price with the IPv4 address included and a simpler console; an option when the free
  months end, as is a small VPS in the EU (Hetzner).
- **Google Cloud's free e2-micro:** free for good, but only in US regions, while the policy promises a server in the
  EU.
