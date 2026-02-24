import { HotkeysProvider as TanStackHotkeysProvider } from "@tanstack/react-hotkeys";
import type { ReactNode } from "react";

type HotkeysProviderProps = {
  children: ReactNode;
};

/**
 * Wrapper around @tanstack/react-hotkeys HotkeysProvider.
 * Sets default options for all hotkeys in the app.
 */
export function HotkeysProvider({ children }: HotkeysProviderProps) {
  return (
    <TanStackHotkeysProvider
      defaultOptions={{
        hotkey: {
          conflictBehavior: "warn",
          preventDefault: true,
        },
      }}
    >
      {children}
    </TanStackHotkeysProvider>
  );
}
