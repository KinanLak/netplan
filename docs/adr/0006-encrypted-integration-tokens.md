---
status: accepted
date: 2026-10-15
title: Integration tokens stored in Convex, encrypted with an environment master key
---

# Integration tokens stored in Convex, encrypted with an environment master key

Per-site integrations (ADR 0005) need API tokens. They are entered in the
admin UI and stored in Convex, encrypted with a master key that only the
backend's environment holds. The fields are write-only: the UI shows whether a
token is set and lets an administrator replace or clear it, never read it back.

Environment variables alone could not express per-site credentials edited by
an administrator; storing them in clear would put every token in every
backup and every `convex export`.

## Consequences

- Losing the master key makes stored tokens unrecoverable; they must be
  entered again. Rotating it re-encrypts every token. Both procedures belong
  in `docs/operations/`.
- Tokens are decrypted only inside Convex actions that call the source; no
  query returns them, and logs never contain them.

## Source

[Decision log](../history/decision-log.md): Q23.
