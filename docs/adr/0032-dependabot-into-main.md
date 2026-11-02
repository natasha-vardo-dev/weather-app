# 0032. Dependency updates go straight into main

- Status: Accepted
- Date: 2026-11-02

## Context

Dependabot opened its pull requests against `dev`, meant as the branch where work happens. In practice work moved to
short-lived branches merged into `main` (pull requests #22–#35), and `dev` was last merged at #21: by 2026-11-02 it was
41 commits behind `main`. Updates were therefore tested by CI against old code, and nothing described how `dev` would
reach `main`.

## Decision

- `.github/dependabot.yml` sets no `target-branch`: version updates go to the default branch, `main`, like security
  updates already did.
- Work happens on short-lived branches merged into `main` with a merge commit; `dev` is not part of the flow.

## Consequences

- CI checks every update against the code that is deployed, and a merged update is ready to deploy.
- One flow to describe and follow; nothing waits in a long-lived branch.
- An update merged into `main` reaches production at the next deploy, so Firebase updates must still be checked live
  before merging (CI cannot test push).
- Pull requests Dependabot already opened against `dev` are closed; it reopens them against `main` on its next run.

## Alternatives considered

- Keep `dev` and merge `main` into it before each update, then `dev` into `main`: two merges per update, and the same
  drift as soon as one is forgotten.
- Keep `dev` as a staging branch with its own deployment: there is no second environment, and a free one is not
  available for the API ([0004](0004-provider-limits.md)).
