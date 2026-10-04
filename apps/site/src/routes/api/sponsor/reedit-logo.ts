import { createFileRoute } from "@tanstack/react-router";
import { handleReeditLogoRead } from "../../../server/logo-upload";

/**
 * The logo a re-edit link keeps, for its preview (phase 7 task 9): `POST`
 * with `{ token }` in the body. `server/logo-upload.ts`.
 */
export const Route = createFileRoute("/api/sponsor/reedit-logo")({
  server: {
    handlers: {
      POST: ({ request }) => handleReeditLogoRead(request),
    },
  },
});
