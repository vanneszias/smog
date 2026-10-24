import { createFileRoute } from "@tanstack/react-router";
import { handleDrawingRead } from "../../../../server/teacher-drawings";

/**
 * A gesture's drawing: `/api/teacher/drawings/<gestureId>/<step>`, for a
 * teacher, translator or admin session only, never public and never in a
 * shared cache (phase 10c task 3, `server/teacher-drawings.ts`).
 */
export const Route = createFileRoute("/api/teacher/drawings/$")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleDrawingRead(request, params._splat ?? ""),
    },
  },
});
