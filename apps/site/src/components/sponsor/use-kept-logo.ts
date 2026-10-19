import { useEffect, useState } from "react";

/** The kept-logo read (`server/logo-upload.ts`, `handleReeditLogoRead`). */
const KEPT_LOGO_PATH = "/api/sponsor/reedit-logo";

/**
 * The logo an open re-edit link keeps, as a `Blob` for the preview (phase 7
 * task 9, task 8 review M-5), so the re-edit preview shows what the render
 * will. The token goes in the body of a same-origin `POST`, never in a URL;
 * the answer is `no-store`. `null` while it loads, without a token (no logo
 * was paid for) or when the read is refused: the preview then shows no
 * logo, which is never wrong about the name. A new token reads again.
 */
export function useKeptLogo(token: string | null): Blob | null {
  const [logo, setLogo] = useState<Blob | null>(null);
  useEffect(() => {
    setLogo(null);
    if (!token) {
      return;
    }
    const controller = new AbortController();
    const read = async (): Promise<void> => {
      try {
        const response = await fetch(KEPT_LOGO_PATH, {
          body: JSON.stringify({ token }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return;
        }
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          setLogo(blob);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[sponsor] Failed to read the kept logo:", error);
        }
      }
    };
    read().catch(() => undefined);
    return () => controller.abort();
  }, [token]);
  return logo;
}
