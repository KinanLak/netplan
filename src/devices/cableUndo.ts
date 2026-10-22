// Cables stay outside the map's undo history (ADR 0022). So that undo still
// reaches a cable just plugged or unplugged (B14), the last cable change
// keeps a way to show its « Annuler » toast again until a map edit or a redo
// comes after it, or the toast is used.
import { useSyncExternalStore } from "react";

let lastCableChange: (() => void) | null = null;
const listeners = new Set<() => void>();

const set = (next: (() => void) | null) => {
  if (next === lastCableChange) return;
  lastCableChange = next;
  for (const listener of listeners) listener();
};

/** Remembers how to show the latest cable change's toast again. */
export const rememberCableChange = (showToast: () => void) => {
  set(showToast);
};

/** Forgets it: a map edit or a redo came after it, or its « Annuler » was used. */
export const forgetCableChange = () => {
  set(null);
};

/**
 * Shows the latest cable change's toast again and forgets it, so the next
 * undo reaches the map. False when there was none.
 */
export const reshowCableChange = (): boolean => {
  const show = lastCableChange;
  set(null);
  show?.();
  return show !== null;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether undo would show a cable change's toast again. */
export const useHasCableChange = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => lastCableChange !== null,
    () => false,
  );
