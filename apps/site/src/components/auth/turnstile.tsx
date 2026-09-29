import { useTranslation } from "@smog/i18n/react";
import { type ReactNode, useEffect, useRef } from "react";

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  remove: (id: string) => void;
  render: (
    element: HTMLElement,
    options: {
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      language: string;
      sitekey: string;
    }
  ) => string;
  reset: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;

/** Loads Cloudflare's widget script once per page. */
function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = SCRIPT_URL;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("turnstile missing after load"));
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export interface TurnstileProps {
  onToken: (token: string | null) => void;
  /** Changing it fetches a fresh token (tokens are single-use). */
  resetKey: number;
  siteKey: string;
}

/**
 * The Turnstile widget (explicit rendering). The token goes to `onToken`;
 * it is cleared when it expires or fails, and renewed on `resetKey`.
 */
export function Turnstile({
  onToken,
  resetKey,
  siteKey,
}: TurnstileProps): ReactNode {
  const { i18n, t } = useTranslation();
  const container = useRef<HTMLFieldSetElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const tokenHandler = useRef(onToken);
  tokenHandler.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) {
          return;
        }
        const id = api.render(container.current, {
          callback: (token) => tokenHandler.current(token),
          "error-callback": () => tokenHandler.current(null),
          "expired-callback": () => tokenHandler.current(null),
          language: i18n.language,
          sitekey: siteKey,
        });
        widget.current = { api, id };
      })
      .catch((error: unknown) => {
        console.error("[turnstile] Failed to load the widget:", error);
      });
    return () => {
      cancelled = true;
      if (widget.current) {
        widget.current.api.remove(widget.current.id);
        widget.current = null;
      }
    };
  }, [i18n.language, siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      tokenHandler.current(null);
      widget.current.api.reset(widget.current.id);
    }
  }, [resetKey]);

  return (
    <fieldset
      aria-label={t("auth.captcha.label")}
      className="min-h-16"
      ref={container}
    />
  );
}
