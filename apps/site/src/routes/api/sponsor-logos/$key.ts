import { createFileRoute } from "@tanstack/react-router";
import { handleSponsorLogoRead } from "../../../server/logo-upload";

/**
 * The logo of a running sponsorship, public, for the end card over the
 * gesture video (phase 10b ruling 9, `server/logo-upload.ts`).
 */
export const Route = createFileRoute("/api/sponsor-logos/$key")({
  server: {
    handlers: {
      GET: ({ params, request }) => handleSponsorLogoRead(request, params.key),
    },
  },
});
