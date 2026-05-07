import * as React from "react";
import { MOBILE_BREAKPOINT } from "@/lib/constants";

const isBrowser = typeof window !== "undefined";
const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const getMobileSnapshot = () => {
  return isBrowser && window.matchMedia(mobileQuery).matches;
};

const subscribeToMobile = (onStoreChange: () => void) => {
  if (!isBrowser) {
    return () => {};
  }

  const mediaQueryList = window.matchMedia(mobileQuery);
  mediaQueryList.addEventListener("change", onStoreChange);

  return () => {
    mediaQueryList.removeEventListener("change", onStoreChange);
  };
};

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    () => false,
  );
}
