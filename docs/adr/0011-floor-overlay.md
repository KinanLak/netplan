---
status: accepted
date: 2026-10-15
title: Each floor can carry a calibrated background "calque"
---

# Each floor can carry a calibrated background "calque"

Placing sockets by hand is the slow part of mapping a building. Each floor can
carry one background image, the « calque », used as a visual guide only:
nothing is read from it automatically.

- Formats: PNG, JPG, SVG and PDF; for a PDF the user picks the page.
- The calque can be moved, resized and rotated, its opacity changed, and it
  can be locked, shown or hidden.
- A two-point calibration sets the scale: the user picks two points and enters
  the real distance between them.

## Consequences

- Map geometry stays in Netplan's own grid; the calibration is a transform of
  the image, not of the map.

## Source

[Decision log](../history/decision-log.md): Q9, Q16, Q25.
