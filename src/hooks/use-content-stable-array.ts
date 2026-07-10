import { useState } from "react";

const areItemsEqual = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * Returns the previous array identity while its items are reference-equal, so
 * memos keyed on derived arrays (filters, slices) only invalidate when their
 * content actually changes.
 */
export function useContentStableArray<T>(
  next: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const [stable, setStable] = useState(next);

  if (stable !== next) {
    if (areItemsEqual(stable, next)) {
      return stable;
    }
    setStable(next);
  }

  return next;
}
