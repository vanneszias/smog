import { useLoaderData } from "@tanstack/react-router";
import { siteOrigin } from "@/lib/site-url";

/** `SITE_URL` (from the shell), without a trailing slash. */
export function useSiteUrl(): string {
  return useLoaderData({
    from: "__root__",
    select: (shell) => siteOrigin(shell.siteUrl),
  });
}

/** Copies text to the clipboard (rejects when the browser refuses). */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("[share] Failed to copy to the clipboard:", error);
    throw error;
  }
}

/**
 * The system share sheet where there is one (phones), else the clipboard.
 * Resolves `"shared"`, `"copied"` or `"cancelled"` (the user closed the
 * sheet); rejects when neither works.
 */
export async function shareUrl(
  url: string,
  title: string
): Promise<"cancelled" | "copied" | "shared"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      console.error("[share] Failed to open the share sheet:", error);
    }
  }
  await copyText(url);
  return "copied";
}
