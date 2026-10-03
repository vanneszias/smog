import { createFileRoute } from "@tanstack/react-router";
import { serveMollieWebhook } from "../../../server/mollie-webhook";

/**
 * The Mollie webhook (phase 6 ruling 2, `server/mollie-webhook.ts`).
 * Mollie POSTs from its own servers with no cookie and no `Origin`, so
 * there is no origin check; the re-fetch with our key is the
 * authentication. It is exempt from maintenance (`/api/webhooks/*`).
 */
export const Route = createFileRoute("/api/webhooks/mollie")({
  server: {
    handlers: {
      POST: ({ request }) => serveMollieWebhook(request),
    },
  },
});
