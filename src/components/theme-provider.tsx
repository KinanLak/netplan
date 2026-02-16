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

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "netplan-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() =>
    getStoredTheme(storageKey, defaultTheme),
  );
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(
    () => {
      if (!isBrowser) {
        return defaultTheme === "dark" ? "dark" : "light";
      }

      return resolveTheme(
        getStoredTheme(storageKey, defaultTheme),
        window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    },
  );

  React.useEffect(() => {
    if (!isBrowser) {
      return;
    }

    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const nextResolvedTheme = resolveTheme(theme, mediaQuery.matches);
      setResolvedTheme(nextResolvedTheme);

      root.classList.remove("light", "dark");
      root.classList.add(nextResolvedTheme);
    };

    const handleMediaChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    applyTheme();
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, [theme]);

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (newTheme: Theme) => {
        if (isBrowser) {
          window.localStorage.setItem(storageKey, newTheme);
        }

        setThemeState(newTheme);
      },
    }),
    [theme, resolvedTheme, storageKey],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  return React.useContext(ThemeProviderContext);
};
