import * as React from "react";
import { useHydrated } from "@/hooks/use-hydrated";

type ResolvedTheme = "dark" | "light";
type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
};

const ThemeProviderContext =
  React.createContext<ThemeProviderState>(initialState);

const isBrowser = typeof window !== "undefined";
const colorSchemeQuery = "(prefers-color-scheme: dark)";
const themeStorageEvent = "netplan-theme-storage-change";
export const THEME_STORAGE_KEY = "netplan-ui-theme";

/**
 * Runs in `<head>` before the first paint, so a dark page never shows light
 * while the app loads. The provider takes over once hydrated.
 */
export const themeScript = `(() => {
  try {
    const stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const dark = stored === "dark" || (stored !== "light" && matchMedia(${JSON.stringify(colorSchemeQuery)}).matches);
    const root = document.documentElement;
    root.classList.add(dark ? "dark" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
  } catch {}
})();`;

const isTheme = (value: string | null): value is Theme => {
  return value === "light" || value === "dark" || value === "system";
};

const getStoredTheme = (storageKey: string, fallback: Theme): Theme => {
  if (!isBrowser) {
    return fallback;
  }

  // A browser may deny storage; the theme then follows the system.
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isTheme(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

const resolveTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme => {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return theme;
};

const getPrefersDarkSnapshot = () => {
  return isBrowser && window.matchMedia(colorSchemeQuery).matches;
};

const subscribeToColorScheme = (onStoreChange: () => void) => {
  if (!isBrowser) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(colorSchemeQuery);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
  };
};

const subscribeToTheme = (storageKey: string, onStoreChange: () => void) => {
  if (!isBrowser) {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(themeStorageEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(themeStorageEvent, onStoreChange);
  };
};

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
  ...props
}: ThemeProviderProps) {
  const theme = React.useSyncExternalStore(
    (onStoreChange) => subscribeToTheme(storageKey, onStoreChange),
    () => getStoredTheme(storageKey, defaultTheme),
    () => defaultTheme,
  );
  const prefersDark = React.useSyncExternalStore(
    subscribeToColorScheme,
    getPrefersDarkSnapshot,
    () => false,
  );
  const resolvedTheme = resolveTheme(theme, prefersDark);
  // The hydration render reads the server's snapshots, which do not know the
  // stored theme: applying them would undo the head script for a frame.
  const hydrated = useHydrated();

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [hydrated, resolvedTheme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (newTheme: Theme) => {
      if (!isBrowser) return;
      try {
        window.localStorage.setItem(storageKey, newTheme);
      } catch {
        return;
      }
      window.dispatchEvent(new Event(themeStorageEvent));
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  return React.useContext(ThemeProviderContext);
};
