import { useColorScheme } from "nativewind";
import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

/**
 * The theme the person chose, kept here because nothing else keeps it.
 *
 * NativeWind's `useColorScheme().colorScheme` is the scheme in *effect*, never
 * the choice: `react-native-css-interop`'s `colorScheme.get()` answers
 * `override ?? systemColorScheme`, and on a device `setColorScheme(...)` never
 * fills in that override. It hands the value to React Native's `Appearance`,
 * whose change listener then updates `systemColorScheme` to the resolved
 * `"light"` or `"dark"`. So it only ever reads `"light"` or `"dark"`, and
 * "follow the system" cannot be told apart from choosing the scheme the
 * system happens to use.
 *
 * Starts as `"system"`: neither NativeWind nor `Appearance` keeps an
 * override across launches, so every launch starts out following the OS.
 */
let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): ThemePreference {
  return preference;
}

/** The chosen theme, and the one way to change it and NativeWind together. */
export function useThemePreference(): {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const { setColorScheme } = useColorScheme();
  const current = useSyncExternalStore(subscribe, read, read);

  const setPreference = (next: ThemePreference): void => {
    setColorScheme(next);
    preference = next;
    for (const listener of listeners) {
      listener();
    }
  };

  return { preference: current, setPreference };
}

/** Tests only: forget the choice so each test starts following the system. */
export function resetThemePreferenceForTests(): void {
  preference = "system";
}
