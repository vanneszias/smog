import { createFileRoute } from "@tanstack/react-router";
import { handleLessonPdf } from "../../../../../server/lesson-pdf";

/**
 * A lesson as a PDF: `/api/teacher/lessons/<lessonId>/pdf?template=&locale=`,
 * for a teacher or admin session only (phase 10c task 5b,
 * `server/lesson-pdf.ts`).
 */
export const Route = createFileRoute("/api/teacher/lessons/$lessonId/pdf")({
  server: {
    handlers: {
      GET: ({ params, request }) => handleLessonPdf(request, params.lessonId),
    },
  },
});
