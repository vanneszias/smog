import { en, fr, nl } from "@smog/i18n";
import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";

/**
 * The settings screen's language switch, and every other screen's route to
 * a translated string: `t(key)` for the text, `setLocale`/`useLocale` for
 * changing and reading which locale `t` reads from.
 *
 * There is no `I18nProvider`. `t` is a plain function reading module-level
 * state, the same shape `session.ts` uses for the token: a `Set` of
 * listeners, notified on every `setLocale` call, and `useLocale` is the one
 * hook that subscribes to it. That is what makes `setLocale` usable on its
 * own — the i18n tests below drive it without rendering anything — while a
 * mounted screen still re-renders when some other screen (or a test) calls
 * it.
 */

/** A translation file, keyed by dot-path segment. */
type Dictionary = Record<string, unknown>;

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr, nl };

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyLocaleChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

let activeLocale: Locale = DEFAULT_LOCALE;

/**
 * Changes the locale every subsequent {@link t} call reads from, and
 * re-renders every mounted {@link useLocale}.
 *
 * Exported standalone rather than only through the hook, because a plain
 * function is what the i18n tests need: they drive `t`'s output through
 * locale changes without rendering a component to do it.
 */
export function setLocale(next: Locale): void {
  if (next === activeLocale) {
    return;
  }

  activeLocale = next;
  notifyLocaleChanged();
}

/** The string at `path` in `dictionary`, or `undefined` if any segment is missing or not a string. */
function read(
  dictionary: Dictionary,
  path: readonly string[]
): string | undefined {
  let node: unknown = dictionary;

  for (const segment of path) {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }

    node = (node as Dictionary)[segment];
  }

  return typeof node === "string" ? node : undefined;
}

/**
 * The translated string for `key` ("search.placeholder") in the active
 * locale.
 *
 * Falls back to {@link DEFAULT_LOCALE}'s string when the active locale
 * doesn't have this key, and to `key` itself when neither does — never to
 * an empty string. A missing translation that renders as nothing looks like
 * a bug nobody can name; the key rendered in its place is at least visible,
 * and a build that renders raw keys on screen is one worth fixing before it
 * ships.
 */
export function t(key: string): string {
  const path = key.split(".");
  const direct = read(DICTIONARIES[activeLocale], path);

  if (direct !== undefined) {
    return direct;
  }

  return read(DICTIONARIES[DEFAULT_LOCALE], path) ?? key;
}

/** The active locale, and the setter that changes it — reactive to every caller's own `setLocale`. */
export function useLocale(): {
  locale: Locale;
  setLocale: (next: Locale) => void;
} {
  const [locale, setLocaleState] = useState(activeLocale);

  useEffect(() => {
    const listener = () => setLocaleState(activeLocale);

    listeners.add(listener);
    // `activeLocale` may have changed between this component's render and
    // this effect committing (another screen's `setLocale`, or a test's);
    // this catches up rather than waiting for the next call.
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { locale, setLocale };
}
