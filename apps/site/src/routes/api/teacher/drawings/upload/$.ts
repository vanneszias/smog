import { createFileRoute } from "@tanstack/react-router";
import { handleDrawingUpload } from "../../../../../server/teacher-drawings";

/** The signed same-origin drawing upload (phase 10c task 3, `server/teacher-drawings.ts`). */
export const Route = createFileRoute("/api/teacher/drawings/upload/$")({
  server: {
    handlers: {
      PUT: ({ params, request }) =>
        handleDrawingUpload(request, params._splat ?? ""),
    },
  },
});
