import {
  type LessonPdfRefusal,
  type LessonTemplate,
  lessonPdfPath,
} from "@smog/lessons/schema";

/** What the dialog can say about a refused or failed download (the `admin.lessons.export.errors` keys). */
export type PdfDownloadProblem =
  | "generic"
  | "rateLimited"
  | "timeout"
  | "tooLarge"
  | "tooMany";

const PROBLEMS: Partial<Record<LessonPdfRefusal, PdfDownloadProblem>> = {
  RATE_LIMITED: "rateLimited",
  TIMEOUT: "timeout",
  TOO_LARGE: "tooLarge",
  TOO_MANY: "tooMany",
};

const FILENAME_PREFIX = 'filename="';

/** The refusal code of the route's JSON body, as a problem for the dialog. */
async function problemOf(response: Response): Promise<PdfDownloadProblem> {
  const body: unknown = await response.json().catch(() => null);
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as { code: unknown }).code)
      : "";
  return PROBLEMS[code as LessonPdfRefusal] ?? "generic";
}

/** Hands the browser a blob as a file download. */
function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // The download has started by the next task; the URL is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Fetches the lesson's PDF with the session cookie and saves it under the
 * name the route gives it (`les-<number>-<locale>.pdf`). A refusal comes
 * back as a problem to show, never as a navigation to a JSON page.
 */
export async function downloadLessonPdf(
  lessonId: string,
  template: LessonTemplate,
  locale: string
): Promise<{ ok: true } | { ok: false; problem: PdfDownloadProblem }> {
  const response = await fetch(lessonPdfPath(lessonId, template, locale), {
    credentials: "same-origin",
  });
  if (!response.ok) {
    return { ok: false, problem: await problemOf(response) };
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const name =
    disposition.split(FILENAME_PREFIX)[1]?.split('"')[0] || "lesson.pdf";
  save(await response.blob(), name);
  return { ok: true };
}
