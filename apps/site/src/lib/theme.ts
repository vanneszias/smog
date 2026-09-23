/**
 * Which of the two token themes `@smog/ui-web` paints with.
 *
 * `theme.css` puts the light values on `:root` and re-declares the dark ones
 * under `.dark`, so switching themes is one class on `<html>` and no `dark:`
 * utilities anywhere. Everything here exists to put that class in the right
 * place at the right moment.
 */
export type ThemeChoice = "light" | "dark";

/** Where a reviewer's choice survives a reload. */
export const THEME_STORAGE_KEY = "smog-theme";

/** The class `theme.css` keys its dark declarations off. */
export const DARK_CLASS = "dark";

/**
 * The theme to start in.
 *
 * A stored choice wins, because it was made deliberately. Anything else —
 * no stored value, or a stored value from an older build that no longer
 * names a theme — falls back to the operating system's preference, which is
 * the closest thing to an opinion the visitor has expressed.
 */
export function resolveTheme(
  stored: string | null,
  prefersDark: boolean
): ThemeChoice {
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return prefersDark ? "dark" : "light";
}

/** The other one. A toggle needs to name where it is going. */
export function toggleTheme(theme: ThemeChoice): ThemeChoice {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Puts a theme on an element, usually `<html>`.
 *
 * Written as `toggle(class, force)` rather than add/remove so that applying
 * `light` actively clears a dark class someone else set. A one-way `add` is
 * the bug where the toggle only ever goes one direction.
 */
export function applyTheme(root: Element, theme: ThemeChoice): void {
  root.classList.toggle(DARK_CLASS, theme === "dark");
}

/**
 * The same decision, as a string of JavaScript that runs before first paint.
 *
 * React cannot do this: the class has to be on `<html>` before the browser
 * paints, and the earliest a component can act is after hydration — one
 * painted frame too late, which a reviewer sees as a white flash on every
 * load of a page they are reviewing in dark mode.
 *
 * It is generated from the same constants the module uses rather than
 * hand-written, so a renamed storage key cannot leave the two disagreeing,
 * and `theme.test.ts` executes the string rather than reading it.
 */
export function themeInitScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const cls = JSON.stringify(DARK_CLASS);

  return [
    "(function(){try{",
    `var stored=window.localStorage.getItem(${key});`,
    'var prefersDark=window.matchMedia("(prefers-color-scheme: dark)").matches;',
    'var dark=stored==="dark"||(stored!=="light"&&prefersDark);',
    `document.documentElement.classList.toggle(${cls},dark);`,
    "}catch(_){}})();",
  ].join("");
}
