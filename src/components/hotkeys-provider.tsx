import { HotkeysProvider as ReactHotkeysProvider } from "react-hotkeys-hook";
import type { ReactNode } from "react";

type HotkeysProviderProps = {
  children: ReactNode;
};

/**
 * Wrapper around react-hotkeys-hook's HotkeysProvider
 * Initializes with global and canvas scopes active by default
 */
export function HotkeysProvider({ children }: HotkeysProviderProps) {
  return (
    <ReactHotkeysProvider initiallyActiveScopes={["global", "canvas"]}>
      {children}
    </ReactHotkeysProvider>
  );
}
