import { createFileRoute } from "@tanstack/react-router";
import { handleLogoRead } from "../../../server/logo-upload";

/**
 * A sponsor logo, for an admin session only (ruling 10; phase 7 adds the
 * render workflow's `x-smog-render` header). `server/logo-upload.ts`.
 */
export const Route = createFileRoute("/api/logos/$key")({
  server: {
    handlers: {
      GET: ({ params, request }) => handleLogoRead(request, params.key),
    },
  },
});
