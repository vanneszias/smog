import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from "react";
import type { Theme } from "./preferences";

interface ThemeValue {
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ThemeValue;
}): ReactNode {
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("[theme] useTheme must be used inside ThemeProvider");
  }
  return value;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the system is in dark mode. The server (and hydration) answer
 * `false`; the pre-paint script has already set the class by then, and
 * `<html>` suppresses that one hydration difference.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(DARK_QUERY).matches,
    () => false
  );
}
