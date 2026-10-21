import { useSyncExternalStore } from "react";

const subscribeToNetwork = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser has a network; true on the server, which has one. */
export const useOnline = () =>
  useSyncExternalStore(
    subscribeToNetwork,
    () => navigator.onLine,
    () => true,
  );
