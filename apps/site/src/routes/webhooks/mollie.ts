import { createFileRoute } from "@tanstack/react-router";
import { serveMollieWebhook } from "../../server/mollie-webhook";

/**
 * The old site's Mollie webhook path (spec §15, inventory R-19): payments
 * created before the cutover still point here. It is the same handler as
 * `/api/webhooks/mollie` (never a redirect: Mollie does not follow one),
 * exempt from maintenance (`EXEMPT_PATHS`), and logs each use. PROGRESS
 * carries its removal 30 days after cutover.
 */
export const Route = createFileRoute("/webhooks/mollie")({
  server: {
    handlers: {
      POST: ({ request }) => serveMollieWebhook(request, { legacy: true }),
    },
  },
});
