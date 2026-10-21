// Cables stay outside the map's undo history (ADR 0022). So that Ctrl+Z
// still reaches a cable just plugged or unplugged (B14), the last cable change
// keeps a way to show its « Annuler » toast again until a map edit comes
// after it or the toast is used.

let lastCableChange: (() => void) | null = null;

/** Remembers how to show the latest cable change's toast again. */
export const rememberCableChange = (showToast: () => void) => {
  lastCableChange = showToast;
};

/** Forgets it: a map edit came after it, or its « Annuler » was used. */
export const forgetCableChange = () => {
  lastCableChange = null;
};

/**
 * Shows the latest cable change's toast again and forgets it, so the next
 * undo reaches the map. False when there was none.
 */
export const reshowCableChange = (): boolean => {
  const show = lastCableChange;
  lastCableChange = null;
  show?.();
  return show !== null;
};
