---
status: accepted
date: 2026-10-15
title: The repository stays public, reviewed by zipzoup on maintainers' pull requests
---

# The repository stays public, reviewed by zipzoup on maintainers' pull requests

The repository `KinanLak/netplan` stays public. Pull requests are reviewed by
zipzoup, the review bot also used on anglix, which acts only on pull requests
from accounts that can push to the repository. Other review bots are removed.

## Consequences

- No secret, internal host name or real inventory data is ever committed;
  gitleaks runs in CI (ADR 0019).
- The project's review rules live in `.github/zipzoup/review.md`, read from
  the base branch of each pull request.

## Source

[Decision log](../history/decision-log.md): Q39.
