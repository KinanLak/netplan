---
status: accepted
date: 2026-10-15
title: The repository is in English, the interface in French
---

# The repository is in English, the interface in French

Code, comments, documentation, ADRs, commit messages and pull requests are
written in English, so that anyone can contribute and agents work in one
language. The interface is in French: its users are French teams. Role names
(Lecteur, Éditeur, Admin) and product terms such as « calque » are UI
vocabulary and keep their French form everywhere.

## Consequences

- User-facing strings, including error messages a user can see, are French.
- Documents written in French before this decision are frozen in
  `docs/history/` rather than translated.

## Source

[Decision log](../history/decision-log.md): Q38.
