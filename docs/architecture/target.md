---
title: Target architecture
description: The shape the rebuild lots are building towards.
---

# Target architecture

The rebuild replaces the current design in place, with no transitional layers
and data restarting from zero (ADR 0001). Order: F, then lots 0 and 1 in
parallel, then lot 2 alongside lot 3a, then 3b, 4 and 5. Lots F, 0, 1, 2,
3a and 4 are done and described in [Current](current.md).

## Map (lot 3b, after lot 2)

Real switch ports coloured by observation, status dots, cables shown only on
demand, and hybrid cable editing (ADR 0009).

## History and operations (lot 5)

Thirty days of location history for Éditeur and Admin (ADR 0014), the one-way
location push to NetBox (ADR 0015), and operations documentation.
