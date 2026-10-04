import { createFileRoute } from "@tanstack/react-router";
import { handleLogoRead } from "../../../server/logo-upload";

/**
 * A sponsor logo, for an admin session only (ruling 10). The render
 * Workflow reads `MEDIA` itself (phase 7 ruling 10), and a re-edit link
 * reads its own kept logo at `/api/sponsor/reedit-logo`.
 * `server/logo-upload.ts`.
 */
export const Route = createFileRoute("/api/logos/$key")({
  server: {
    handlers: {
      GET: ({ params, request }) => handleLogoRead(request, params.key),
    },
  },
});
