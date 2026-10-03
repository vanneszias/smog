import { createFileRoute } from "@tanstack/react-router";
import { handleLogoUpload } from "../../../server/logo-upload";

/** The signed same-origin logo upload (ruling 10, `server/logo-upload.ts`). */
export const Route = createFileRoute("/api/logos/upload/$key")({
  server: {
    handlers: {
      PUT: ({ params, request }) => handleLogoUpload(request, params.key),
    },
  },
});
