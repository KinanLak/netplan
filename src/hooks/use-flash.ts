import { useEffect, useRef, useState } from "react";

const FLASH_MS = 2_000;

/**
 * A confirmation shown in place, for a moment: a button that reads
 * « Enregistré » after a save, rather than a toast (the owner's rule for small
 * actions whose result is already visible).
 */
export function useFlash(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), FLASH_MS);
  };
  return [on, flash];
}
