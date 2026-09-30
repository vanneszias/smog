import { createFileRoute } from "@tanstack/react-router";
import { turnstileBridge } from "@/server/turnstile-bridge";

/** The app's Turnstile sheet loads this page (`@/server/turnstile-bridge`). */
export const Route = createFileRoute("/turnstile-bridge")({
  server: { handlers: { GET: ({ request }) => turnstileBridge(request) } },
});
