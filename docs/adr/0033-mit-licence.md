# 0033. MIT licence for the code; the service stays non-commercial

- Status: Accepted
- Date: 2026-11-02

## Context

The repository is public on GitHub but had no licence file, which legally means all rights reserved: nobody may
reuse the code, whatever the README implies. Two things pull in different directions. The code is ordinary and
worth sharing. The deployed service is non-commercial by necessity, since Open-Meteo's free tier allows only
non-commercial use ([0004](0004-provider-limits.md)), and the data from every provider comes under its own terms.

## Decision

- The code is licensed under the **MIT licence** (`LICENSE` in the root; `info.license` in `docs/openapi.json`).
- The licence covers the code only. The README says that the deployed service is non-commercial because of the
  providers' terms, and that the data stays under those terms, credited in the app.

## Consequences

- Anyone may use, change and redistribute the code, commercially too; whoever runs it with Open-Meteo's free tier
  takes on its non-commercial condition, and with a paid tier may do as they like.
- Contributions arrive under the same licence; no contributor agreement is needed.
- The `LICENSE` file must stay in the root and is best left untouched: tooling and GitHub recognise it by its text.

## Alternatives considered

- **No licence:** the status quo; forbids reuse by default and looks like an oversight.
- **A non-commercial licence (CC BY-NC):** written for creative works, not code; not an open-source licence, and
  it would restrict the code for a condition that belongs to the data, not to it.
- **AGPL-3.0:** makes anyone running a changed version publish their changes; more obligation than a weather page
  warrants, and it deters reuse in commercial or proprietary code without protecting anything here.
- **Apache-2.0:** MIT's permissions with a patent grant and a notice file; nothing here is patentable, and MIT is
  the shorter, better-known text.
