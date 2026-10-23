import { ensureCatalogues } from "@smog/i18n";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

/**
 * The browser entry (Start's default plus one step): the page is rendered in
 * the language of `<html lang>`, so that language's shipped catalogue has to
 * be in memory before hydration (phase 10b task 7b; the entry carries none).
 * The server-rendered page is on screen meanwhile, so nothing flashes; a
 * failed load is logged and hydration goes on (the keys would show, which is
 * why it is loud).
 */
async function hydrate(): Promise<void> {
  try {
    await ensureCatalogues(document.documentElement.lang);
  } catch (error) {
    console.error("[i18n] Failed to load the catalogue:", error);
  }
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>
    );
  });
}

hydrate().catch((error: unknown) => {
  console.error("[i18n] Failed to hydrate:", error);
});
