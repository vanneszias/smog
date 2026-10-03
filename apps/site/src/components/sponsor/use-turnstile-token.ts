import { useCallback, useEffect, useState } from "react";

export interface TurnstileToken {
  /** Bumped on every reset: the widget's `resetKey` (a fresh token). */
  key: number;
  /** Drops the token and asks the widget for a new one (single use). */
  reset: () => void;
  setToken: (token: string | null) => void;
  token: string | null;
}

/**
 * A Turnstile token that never outlives its use or its widget (phase
 * review M-3): `reset` after a failed attempt or when the widget leaves
 * the screen, and on a bfcache return (`pageshow` with `persisted`), which
 * restores the page with a token Cloudflare already spent.
 */
export function useTurnstileToken(): TurnstileToken {
  const [token, setToken] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setKey((value) => value + 1);
  }, []);
  useEffect(() => {
    const onShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        reset();
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [reset]);
  return { key, reset, setToken, token };
}
