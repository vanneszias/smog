/**
 * Producing a lesson PDF (phase 10c task 5b, spec 5.4, plan ruling 3): the
 * cache key, the R2 cache with streaming, the limits and the budget, the
 * document description for the engine, and the audit entry.
 *
 * The cached file is `teacher/pdf/<lessonId>/<fingerprint>-<template>-
 * <locale>.pdf`. The fingerprint is a short hash of everything that can
 * change the print: the layout version, `lesson.version` (every lesson
 * write), each contained gesture's name and translation stamps, its teacher
 * info versions (the language and the default one), its drawing keys (a new
 * key on every replace), its C keywords, the default language and the label
 * texts. A stale file is therefore never matched, nothing is invalidated,
 * and the daily retention deletes what is older than 30 days. **Private
 * material.**
 */

import type { Db } from "@smog/db/client";
import type { LessonPdfDocumentInput, PdfAssets } from "@smog/pdf";
import {
  LESSON_PDF_BUDGET_MS,
  LESSON_PDF_LIMITS,
  type LessonExportPreview,
  type LessonTemplate,
} from "../schema";
import { auditStatement } from "./audit";
import {
  type ExportPlan,
  LESSON_PDF_LAYOUT_VERSION,
  LessonExportError,
  planLessonExport,
} from "./export-plan";

/** The texts of the PDF that come from the translation catalogue, in the export language. */
export interface ExportLabels {
  /** The footnote under pages with a default-language row. */
  fallbackFootnote: string;
  /** "Les", printed before the lesson number. */
  lesson: string;
}

/** The cache prefix; the retention sweep deletes under it. */
export const LESSON_PDF_PREFIX = "teacher/pdf/";
/** A PDF over this is refused with a clear error (Worker memory is 128 MB). */
export const LESSON_PDF_MAX_BYTES = 15 * 1_048_576;
/** Drawings read from R2 at once. */
const DRAWING_READ_BATCH = 8;

/** The drawing types `pdf-lib` embeds. */
const EMBEDDABLE = new Set(["image/jpeg", "image/png"]);

export interface ExportDeps {
  /** Asked only for a render (a cache hit is cheap): `false` is refused. */
  allowRender?: () => Promise<boolean>;
  /** The fonts and the logo (a binary import in the Worker). */
  assets: () => Promise<PdfAssets>;
  /** Wall-clock budget in ms. */
  budgetMs?: number;
  db: Db;
  /** Output size cap in bytes (tests lower it). */
  maxBytes?: number;
  media: R2Bucket;
  now?: () => number;
}

export interface ExportInput {
  labels: ExportLabels;
  lessonId: string;
  locale: string;
  template: LessonTemplate;
}

export interface ExportResult {
  /** The PDF, as a stream (cache hit) or bytes (fresh). */
  body: ReadableStream | Uint8Array<ArrayBuffer>;
  cached: boolean;
  /** Drawings the PDF could not hold (a WebP, an unreadable object). */
  droppedDrawings: number;
  filename: string;
  /** Gestures in the PDF and gestures left out (unpublished). */
  gestures: number;
  key: string;
  lessonNumber: number | null;
  size: number;
  skipped: number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** The short hash of what the print depends on (see the file comment). */
async function exportFingerprint(
  plan: ExportPlan,
  labels: ExportLabels
): Promise<string> {
  const hash = await sha256Hex(
    JSON.stringify([
      LESSON_PDF_LAYOUT_VERSION,
      plan.lesson.version,
      plan.defaultLocale,
      labels,
      plan.sections.map((section) => section.rows.map((row) => row.stamp)),
      plan.skipped.map((item) => item.id),
    ])
  );
  return hash.slice(0, 16);
}

/** `teacher/pdf/<lessonId>/<fingerprint>-<template>-<locale>.pdf` */
function lessonPdfKey(
  lessonId: string,
  fingerprint: string,
  template: LessonTemplate,
  locale: string
): string {
  return `${LESSON_PDF_PREFIX}${lessonId}/${fingerprint}-${template}-${locale}.pdf`;
}

/** `les-<number>-<locale>.pdf`, or `les-<locale>.pdf` for a lesson without a number. */
export function lessonPdfFilename(
  number: number | null,
  locale: string
): string {
  return number === null ? `les-${locale}.pdf` : `les-${number}-${locale}.pdf`;
}

/** The engine's input: the plan, the labels and the drawings that were read. */
function toPdfDocument(
  plan: ExportPlan,
  input: ExportInput,
  drawings: ReadonlyMap<string, Uint8Array>
): LessonPdfDocumentInput {
  return {
    labels: {
      fallbackFootnote: input.labels.fallbackFootnote,
      lesson: input.labels.lesson,
    },
    locale: input.locale,
    notes: plan.lesson.notes,
    number: plan.lesson.number,
    sections: plan.sections.map((section) => ({
      rows: section.rows.map((row) => ({
        bw: row.fields.bw,
        cNote: row.fields.cNote,
        drawings: row.drawings.flatMap((drawing) => {
          const bytes = drawings.get(drawing.key);
          return bytes
            ? [{ bytes, credit: drawing.credit, step: drawing.step }]
            : [];
        }),
        fallback: row.fallback,
        hc: row.fields.hc,
        id: row.id,
        keywords: row.keywords,
        note: row.fields.note,
        or: row.fields.or,
        pl: row.fields.pl,
        summary: row.fields.summary,
        word: row.word,
      })),
      title: section.title,
    })),
    template: input.template,
    title: plan.lesson.title,
  };
}

/** `promise`, or a `TIMEOUT` when `ms` pass first (I/O only: a synchronous render cannot be interrupted). */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new LessonExportError(
            "TIMEOUT",
            "[lessons] The PDF took longer than its budget"
          )
        ),
      Math.max(ms, 0)
    );
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The embeddable drawings of the plan, read from R2 a few at a time; how many could not be had. */
async function readDrawings(
  media: R2Bucket,
  plan: ExportPlan
): Promise<{ bytes: Map<string, Uint8Array>; dropped: number }> {
  const wanted = plan.sections.flatMap((section) =>
    section.rows.flatMap((row) => row.drawings)
  );
  const bytes = new Map<string, Uint8Array>();
  let dropped = wanted.filter(
    (drawing) => !EMBEDDABLE.has(drawing.contentType)
  ).length;
  const readable = wanted.filter((drawing) =>
    EMBEDDABLE.has(drawing.contentType)
  );
  for (let at = 0; at < readable.length; at += DRAWING_READ_BATCH) {
    const batch = readable.slice(at, at + DRAWING_READ_BATCH);
    // biome-ignore lint/performance/noAwaitInLoops: batches of eight bound the memory of the drawings in flight.
    const objects = await Promise.all(
      batch.map(async (drawing) => {
        const object = await media.get(drawing.key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      })
    );
    for (const [index, data] of objects.entries()) {
      const drawing = batch[index];
      if (data && drawing) {
        bytes.set(drawing.key, data);
      } else {
        dropped += 1;
      }
    }
  }
  return { bytes, dropped };
}

/**
 * The PDF of a lesson in a template and language: from the R2 cache when a
 * file for this fingerprint exists, else rendered (rate limited and
 * budgeted), size-checked and stored. `null` for an unknown lesson.
 * `LessonExportError`: `TOO_MANY` (the template's cap), `TOO_LARGE`,
 * `TIMEOUT`, `RATE_LIMITED`.
 */
export async function exportLessonPdf(
  deps: ExportDeps,
  input: ExportInput
): Promise<ExportResult | null> {
  const { db, media } = deps;
  const now = deps.now ?? Date.now;
  const started = now();
  const budget = deps.budgetMs ?? LESSON_PDF_BUDGET_MS;
  try {
    const plan = await planLessonExport(db, input);
    if (!plan) {
      return null;
    }
    const fingerprint = await exportFingerprint(plan, input.labels);
    const key = lessonPdfKey(
      input.lessonId,
      fingerprint,
      input.template,
      input.locale
    );
    const common = {
      filename: lessonPdfFilename(plan.lesson.number, input.locale),
      gestures: plan.rowCount,
      key,
      lessonNumber: plan.lesson.number,
      skipped: plan.skipped.length,
    };
    const hit = await media.get(key);
    if (hit) {
      return {
        ...common,
        body: hit.body,
        cached: true,
        droppedDrawings: 0,
        size: hit.size,
      };
    }
    if (deps.allowRender && !(await deps.allowRender())) {
      throw new LessonExportError(
        "RATE_LIMITED",
        "[lessons] Too many PDF renders"
      );
    }
    const remaining = () => budget - (now() - started);
    const { bytes: drawings, dropped } = await withDeadline(
      readDrawings(media, plan),
      remaining()
    );
    const [{ renderLessonPdfDetailed }, assets] = await Promise.all([
      // Its own chunk: pdf-lib and fontkit load only when a PDF is made.
      import("@smog/pdf"),
      deps.assets(),
    ]);
    const report = await renderLessonPdfDetailed(
      toPdfDocument(plan, input, drawings),
      assets
    );
    if (remaining() < 0) {
      throw new LessonExportError(
        "TIMEOUT",
        "[lessons] The PDF took longer than its budget"
      );
    }
    const maxBytes = deps.maxBytes ?? LESSON_PDF_MAX_BYTES;
    if (report.bytes.byteLength > maxBytes) {
      throw new LessonExportError(
        "TOO_LARGE",
        `[lessons] The PDF is ${report.bytes.byteLength} bytes, over ${maxBytes}`,
        { limit: maxBytes }
      );
    }
    const output = new Uint8Array(report.bytes);
    try {
      await media.put(key, output, {
        customMetadata: { createdAt: new Date(now()).toISOString() },
        httpMetadata: { contentType: "application/pdf" },
      });
    } catch (error) {
      // The cache is an optimisation: the teacher still gets the file.
      console.error(`[lessons] Failed to cache ${key}:`, error);
    }
    return {
      ...common,
      body: output,
      cached: false,
      droppedDrawings: dropped + report.droppedDrawings.length,
      size: output.byteLength,
    };
  } catch (error) {
    if (!(error instanceof LessonExportError)) {
      console.error("[lessons] Failed to export a lesson PDF:", error);
    }
    throw error;
  }
}

/** The audit entry of an export: counts, the language and the template, never a text. */
export async function recordLessonExport(
  db: Db,
  entry: {
    actorId: string;
    cached: boolean;
    gestures: number;
    lessonId: string;
    locale: string;
    skipped: number;
    template: LessonTemplate;
  }
): Promise<void> {
  try {
    await auditStatement(db, {
      action: "lesson.export",
      actorId: entry.actorId,
      data: {
        cached: entry.cached,
        gestures: entry.gestures,
        locale: entry.locale,
        skipped: entry.skipped,
        template: entry.template,
      },
      targetId: entry.lessonId,
      targetType: "lesson",
    });
  } catch (error) {
    console.error("[lessons] Failed to audit a lesson export:", error);
    throw error;
  }
}

/**
 * What the export dialog shows before the download: the gestures that print
 * default-language text or nothing, drawings the PDF cannot hold, the
 * unpublished gestures left out, and whether the lesson is over the
 * template's cap. `null` for an unknown lesson.
 */
export async function previewLessonExport(
  db: Db,
  input: { lessonId: string; locale: string; template: LessonTemplate }
): Promise<LessonExportPreview | null> {
  try {
    const plan = await planLessonExport(db, input);
    if (!plan) {
      return null;
    }
    const issues = plan.sections.flatMap((section) =>
      section.rows.flatMap((row) => {
        const issue = {
          fallback: row.fallback,
          id: row.id,
          missing: row.missing,
          name: row.word,
          noDrawing:
            input.template === "participants" && row.drawings.length === 0,
          unsupportedDrawing: row.drawings.some(
            (drawing) => !EMBEDDABLE.has(drawing.contentType)
          ),
        };
        return issue.fallback ||
          issue.missing ||
          issue.noDrawing ||
          issue.unsupportedDrawing
          ? [issue]
          : [];
      })
    );
    return {
      gestures: plan.rowCount,
      issues,
      limit: LESSON_PDF_LIMITS[input.template],
      overLimit: false,
      skipped: plan.skipped,
    };
  } catch (error) {
    if (error instanceof LessonExportError && error.code === "TOO_MANY") {
      return {
        gestures: error.count ?? 0,
        issues: [],
        limit: LESSON_PDF_LIMITS[input.template],
        overLimit: true,
        skipped: [],
      };
    }
    throw error;
  }
}
