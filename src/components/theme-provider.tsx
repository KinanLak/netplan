import * as React from "react";

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

const isTheme = (value: string | null): value is Theme => {
  return value === "light" || value === "dark" || value === "system";
};

const getStoredTheme = (storageKey: string, fallback: Theme): Theme => {
  if (!isBrowser) {
    return fallback;
  }

  const stored = window.localStorage.getItem(storageKey);
  return isTheme(stored) ? stored : fallback;
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
  storageKey = "netplan-ui-theme",
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

  React.useEffect(() => {
    if (!isBrowser) {
      return;
    }

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [resolvedTheme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (newTheme: Theme) => {
      if (isBrowser) {
        window.localStorage.setItem(storageKey, newTheme);
        window.dispatchEvent(new Event(themeStorageEvent));
      }
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
