---
status: accepted
date: 2026-10-15
title: The calque is a raster image in Convex storage, placed by map operations, and the plan has a fixed scale of 100 units per metre
---

# The calque is a raster image in Convex storage, placed by map operations, and the plan has a fixed scale of 100 units per metre

This records how lot 3a builds ADR 0011.

## Scale of the plan

The plan had no unit. It now has one: **100 plan units are one metre**, so a
20-unit grid cell, and therefore a wall block, is 20 cm. At that scale the
seed's technical room is about 5 × 3 m and a rack is drawn about its real
size. The scale is a constant of the map, not a setting: ADR 0011 keeps the
map in its own grid and calibrates the image, never the map. Device icons stay
at the size that reads well, not to scale.

## Files

- The browser turns every import into a PNG or JPEG before upload. A PDF page
  is rasterized with pdf.js after the user picks the page; an SVG is drawn
  through an `<img>` element, where scripts and external loads never run, onto
  a canvas. No SVG or PDF is ever stored or served, so nothing in a calque can
  execute, even when its storage URL is opened directly.
- Files go through an Éditeur action, not an upload URL: the action checks the
  PNG or JPEG signature, reads the pixel size from the header, refuses files
  over 15 MB or 16 384 px a side, and only then stores the bytes and records
  them in `floorOverlayFiles`. Nothing unchecked ever lands in storage.
- Images are shown through Convex storage URLs, which are unguessable and only
  handed out by a query that requires a signed-in user.
- A file stays while a calque uses it. Once unused for seven days a daily job
  deletes it; until then undo can bring it back.

## Placement

- Each floor has at most one row in `floorOverlays`: the file, its pixel size,
  the centre in plan units, the scale in plan units per image pixel, the
  rotation in degrees, the opacity and the lock. Scaling keeps the image's
  aspect ratio; a plan is never stretched.
- Changes are map operations like any other: `overlay.set` places, replaces
  or removes the calque, `overlay.patch` changes its placement, opacity or
  lock. Each has an inverse, so undo and redo work, and the server validates
  the floor, the file and the numbers.
- A locked calque refuses placement changes and replacement on the server,
  unless the same change unlocks it. Opacity still changes while locked, so the
  calque can be faded while drawing walls over it.
- Showing or hiding the calque is a personal view setting, kept in the
  browser session: any role may hide it, and hiding it for oneself never hides
  it for a colleague.

## Calibration

The user clicks two points on the image and types the real distance between
them in metres. The image is scaled about the first point so that the two
points end up `metres × 100` units apart. Calibration is one `overlay.patch`,
undone like any other.

## Consequences

- Distances on the map can now be read in metres; later features (cable
  lengths, a scale bar) use the same constant.
- Very large sheets lose detail: a rasterized PDF page is capped at 8 192 px
  on its longer side.
- `floorOverlayFiles` is the only owner of storage today; a later feature that
  stores files needs its own table and its own cleanup.

## Source

[Decision log](../history/decision-log.md): Q16, Q25, and the lot 3a journal.
