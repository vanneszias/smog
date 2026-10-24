import { AuthError, getSession, requireRoleUser } from "@smog/auth";
import { createDb } from "@smog/db/client";
import { createI18n } from "@smog/i18n";
import { lessonTemplateSchema } from "@smog/lessons/schema";
import {
  type ExportLabels,
  type ExportResult,
  exportLessonPdf,
  LessonExportError,
  recordLessonExport,
} from "@smog/lessons/server";
import { checkRateLimit } from "@smog/rpc";
import { getAuth, siteEnv } from "./auth";
import { enabledLanguageCodes, loadSiteCatalogue } from "./catalogue";
import { clientIp } from "./context";
import { loadPdfAssets } from "./lesson-pdf-assets";

/**
 * `GET /api/teacher/lessons/<lessonId>/pdf?template=teachers|participants&
 * locale=<code>` (phase 10c task 5b, spec 5.4): the lesson as a PDF, for a
 * signed-in teacher or admin only (a guest gets 401 and any other account
 * 403 before anything about the lesson is looked at). `locale` must be an
 * enabled language, `template` one of the two templates, the id a UUID (400
 * otherwise; 404 for a lesson that does not exist).
 *
 * The first export of a (lesson state, template, language) renders the file
 * and stores it in R2; the next one streams it (`@smog/lessons/server`
 * `exportLessonPdf`). Limits: 150 gestures (teachers) / 80 (participants)
 * answer 422 `TOO_MANY`; a PDF over 15 MiB 422 `TOO_LARGE`; the 25 s budget
 * 504 `TIMEOUT`; renders are limited per user (`RL_SPONSOR`, the strictest
 * existing binding, key `lesson-pdf:<userId>`; a cached file is not a
 * render) with 429 `RATE_LIMITED`. Every request is limited per IP on
 * `RL_API`. `Content-Disposition: attachment`, `private, no-store`, one
 * audit entry `lesson.export` (counts only).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

/** The session's user when it holds the teacher role (an admin passes), else the refusal. */
async function teacherOrRefusal(
  request: Request
): Promise<{ id: string } | Response> {
  try {
    return requireRoleUser(
      await getSession(getAuth(), request.headers),
      "teacher"
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return json(error.code === "UNAUTHORIZED" ? 401 : 403, {
        code: error.code,
      });
    }
    console.error("[lesson-pdf] Failed to check the session:", error);
    throw error;
  }
}

/** "Les" and the dagger footnote in the export language (the `ui_string` overlay over the shipped texts). */
async function labelsFor(locale: string): Promise<ExportLabels> {
  const catalogue = await loadSiteCatalogue((enabled, fallback) =>
    enabled.includes(locale) ? locale : fallback
  );
  const { t } = createI18n(locale, catalogue.overlay);
  const base = catalogue.languages.find((language) => language.isDefault);
  return {
    fallbackFootnote: t("lessonPdf.fallbackFootnote", {
      language: base?.name ?? "Nederlands",
    }),
    lesson: t("lessonPdf.lesson"),
  };
}

const ERRORS = {
  RATE_LIMITED: [429, "RATE_LIMITED"],
  TIMEOUT: [504, "TIMEOUT"],
  TOO_LARGE: [422, "TOO_LARGE"],
  TOO_MANY: [422, "TOO_MANY"],
} as const;

function refusal(error: LessonExportError): Response {
  const [status, code] = ERRORS[error.code];
  return json(status, { code, count: error.count, limit: error.limit });
}

function pdfResponse(result: ExportResult): Response {
  return new Response(result.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${result.filename}"`,
      "content-length": String(result.size),
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": "application/pdf",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
    status: 200,
  });
}

export async function handleLessonPdf(
  request: Request,
  lessonId: string
): Promise<Response> {
  const { db, rateLimits } = siteEnv();
  if (
    !(await checkRateLimit(
      rateLimits.RL_API,
      `${clientIp(request)}:lesson-pdf`
    ))
  ) {
    return json(429, { code: "RATE_LIMITED" });
  }
  const user = await teacherOrRefusal(request);
  if (user instanceof Response) {
    return user;
  }
  const url = new URL(request.url);
  const template = lessonTemplateSchema.safeParse(
    url.searchParams.get("template")
  );
  const locale = url.searchParams.get("locale") ?? "";
  if (!(UUID.test(lessonId) && template.success)) {
    return json(400, { code: "BAD_REQUEST" });
  }
  if (!(await enabledLanguageCodes()).includes(locale)) {
    return json(400, { code: "LOCALE_NOT_ENABLED" });
  }
  try {
    const result = await exportLessonPdf(
      {
        allowRender: () =>
          checkRateLimit(rateLimits.RL_SPONSOR, `lesson-pdf:${user.id}`),
        assets: loadPdfAssets,
        db: createDb(db),
        media: siteEnv().bindings.MEDIA,
      },
      {
        labels: await labelsFor(locale),
        lessonId,
        locale,
        template: template.data,
      }
    );
    if (!result) {
      return json(404, { code: "NOT_FOUND" });
    }
    await recordLessonExport(createDb(db), {
      actorId: user.id,
      cached: result.cached,
      gestures: result.gestures,
      lessonId,
      locale,
      skipped: result.skipped,
      template: template.data,
    });
    return pdfResponse(result);
  } catch (error) {
    if (error instanceof LessonExportError) {
      return refusal(error);
    }
    console.error("[lesson-pdf] Failed to export a lesson:", error);
    throw error;
  }
}
