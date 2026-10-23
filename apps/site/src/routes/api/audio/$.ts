import { createFileRoute } from "@tanstack/react-router";
import { handleAudioRead } from "../../../server/audio";

/**
 * A gesture's spoken name: `/api/audio/<gestureId>/<locale>/<uuid>`, public,
 * cached for a year (the key changes on every replace), `Range` supported
 * (phase 10b ruling 6, `server/audio.ts`).
 */
export const Route = createFileRoute("/api/audio/$")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleAudioRead(request, params._splat ?? ""),
    },
  },
});
