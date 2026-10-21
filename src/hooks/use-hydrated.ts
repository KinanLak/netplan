import { useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

/** False during the server render and hydration, true once React runs. */
export const useHydrated = () =>
  useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
