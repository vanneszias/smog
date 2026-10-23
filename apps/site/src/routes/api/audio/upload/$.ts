import { createFileRoute } from "@tanstack/react-router";
import { handleAudioUpload } from "../../../../server/audio";

/** The signed same-origin audio upload (phase 10b ruling 6, `server/audio.ts`). */
export const Route = createFileRoute("/api/audio/upload/$")({
  server: {
    handlers: {
      PUT: ({ params, request }) =>
        handleAudioUpload(request, params._splat ?? ""),
    },
  },
});
