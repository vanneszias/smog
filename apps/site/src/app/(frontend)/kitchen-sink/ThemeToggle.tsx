"use client";

import { Button } from "@smog/ui-web";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeChoice,
  toggleTheme,
} from "@/lib/theme";

/** Names where the button goes, not where it is. */
function toggleLabel(theme: ThemeChoice | null): string {
  if (theme === null) {
    return "Thema";
  }

  return theme === "dark" ? "Licht thema" : "Donker thema";
}

/**
 * Switches the whole page between the two token themes.
 *
 * The class is already on `<html>` before this mounts — the layout's inline
 * script put it there — so the only job left is to read back which one won
 * and keep the button's label honest. Starting from `null` and filling it in
 * an effect is deliberate: the server cannot know what a reviewer chose last
 * time, and rendering a guess would be a hydration mismatch on every load.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }

    setTheme(
      resolveTheme(
        stored,
        window.matchMedia("(prefers-color-scheme: dark)").matches
      )
    );
  }, []);

  const handleClick = () => {
    const next = toggleTheme(theme ?? "light");

    setTheme(next);
    applyTheme(document.documentElement, next);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* A private window keeps the choice for this page load only. */
    }
  };

  const isDark = theme === "dark";

  return (
    <Button
      aria-pressed={isDark}
      onClick={handleClick}
      size="sm"
      variant="outline"
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
      {toggleLabel(theme)}
    </Button>
  );
}
