// biome-ignore-all lint/performance/noAwaitInLoops: fixtures are written and checked one row at a time.
import { env } from "cloudflare:workers";
import { PDFDocument } from "pdf-lib";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LESSON_PDF_LIMITS, type LessonDetail } from "../src/schema";
import { LessonExportError } from "../src/server/export-plan";
import {
  type ExportDeps,
  type ExportInput,
  exportLessonPdf,
  lessonPdfFilename,
  previewLessonExport,
  recordLessonExport,
} from "../src/server/export-run";
import {
  type Authed,
  addGesture,
  auditMark,
  auditRowsSince,
  lessonsAs,
  resetTeacherData,
  signedUp,
  testDb,
} from "./helpers";

const ENGLISH_TEACHERS = /-teachers-en\.pdf$/;

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

const LABELS = {
  fallbackFootnote: "† Not translated: shown in Nederlands",
  lesson: "Lesson",
};

function deps(over: Partial<ExportDeps> = {}): ExportDeps {
  return {
    assets: () =>
      Promise.resolve({
        boldFont: fromBase64(env.FONT_BOLD_B64),
        logo: fromBase64(env.LOGO_B64),
        regularFont: fromBase64(env.FONT_REGULAR_B64),
      }),
    db: testDb(),
    media: env.MEDIA,
    ...over,
  };
}

let author: Authed;
let lessonId: string;
let hallo: string;
let dag: string;
let hidden: string;

beforeAll(async () => {
  author = await signedUp("teacher");
});

async function clearPdfCache(): Promise<void> {
  const listed = await env.MEDIA.list({ prefix: "teacher/" });
  await Promise.all(listed.objects.map((o) => env.MEDIA.delete(o.key)));
}

function input(over: Partial<ExportInput> = {}): ExportInput {
  return {
    labels: LABELS,
    lessonId,
    locale: "fr",
    template: "teachers",
    ...over,
  };
}

async function info(
  gestureId: string,
  locale: string,
  fields: Partial<
    Record<"bw" | "c_note" | "hc" | "note" | "pl" | "summary", string>
  >
): Promise<void> {
  const row = {
    bw: "",
    c_note: "",
    hc: "",
    note: "",
    pl: "",
    summary: "",
    ...fields,
  };
  await env.DB.prepare(
    "INSERT INTO gesture_teacher_info (gesture_id, locale, hc, pl, bw, c_note, note, summary, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)"
  )
    .bind(
      gestureId,
      locale,
      row.hc,
      row.pl,
      row.bw,
      row.c_note,
      row.note,
      row.summary
    )
    .run();
}

async function drawing(
  gestureId: string,
  step: 1 | 2,
  bytes: Uint8Array<ArrayBuffer>,
  contentType = "image/png"
): Promise<string> {
  const key = `teacher/drawings/${gestureId}/${step}/${crypto.randomUUID()}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
  await env.DB.prepare(
    "INSERT OR REPLACE INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, credit, updated_at) VALUES (?, ?, ?, ?, ?, 10, 10, ?, ?)"
  )
    .bind(
      gestureId,
      step,
      key,
      contentType,
      bytes.byteLength,
      "© Invented",
      Date.now()
    )
    .run();
  return key;
}

async function save(change: (stored: LessonDetail) => Record<string, unknown>) {
  const stored = await lessonsAs<LessonDetail>(author, "get", { id: lessonId });
  return await lessonsAs(author, "update", {
    expectedVersion: stored.version,
    id: lessonId,
    number: stored.number,
    sections: stored.sections.map((section) => ({
      gestureIds: section.items.map((item) => item.id),
      id: section.id,
      titles: section.titles,
    })),
    translations: stored.translations,
    ungrouped: stored.ungrouped.map((item) => item.id),
    ...change(stored),
  });
}

beforeEach(async () => {
  await resetTeacherData();
  await clearPdfCache();
  await env.DB.prepare(
    "UPDATE language SET enabled = 1 WHERE code IN ('nl', 'en', 'fr')"
  ).run();
  hallo = await addGesture("Hallo", { published: true });
  dag = await addGesture("Dag", { published: true });
  hidden = await addGesture("Verborgen");
  const created = await lessonsAs<{ id: string }>(author, "create", {
    locale: "nl",
    number: 3,
    title: "Les drie",
  });
  lessonId = created.id;
  await save(() => ({
    sections: [
      {
        gestureIds: [dag],
        id: crypto.randomUUID(),
        titles: { nl: "Afscheid" },
      },
    ],
    translations: {
      fr: { notes: "", title: "Leçon trois" },
      nl: { notes: "Veel oefenen", title: "Les drie" },
    },
    ungrouped: [hallo],
  }));
  // A gesture unpublished after it was added stays in the lesson.
  await env.DB.prepare(
    "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES (?, NULL, ?, 5)"
  )
    .bind(lessonId, hidden)
    .run();
  await env.DB.prepare(
    "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES (?, 'nl', 'hallo', 0), (?, 'nl', 'dag', 0), (?, 'fr', 'bonjour', 0)"
  )
    .bind(hallo, dag, hallo)
    .run();
  await info(hallo, "nl", {
    bw: "zwaaien",
    hc: "vlakke hand",
    pl: "naast het hoofd",
  });
  await info(hallo, "fr", { hc: "main plate" });
  await info(dag, "nl", { hc: "vuist", summary: "Samenvatting dag" });
});

describe("exportLessonPdf", () => {
  it("renders a PDF, stores it under the fingerprint key and serves the second call from R2", async () => {
    const first = await exportLessonPdf(deps(), input());
    expect(first).not.toBeNull();
    expect(first).toMatchObject({
      cached: false,
      filename: "les-3-fr.pdf",
      gestures: 2,
      skipped: 1,
    });
    expect(first?.key).toMatch(
      new RegExp(`^teacher/pdf/${lessonId}/[0-9a-f]{16}-teachers-fr\\.pdf$`)
    );
    const bytes = first?.body as Uint8Array;
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toContain("Leçon trois");
    const second = await exportLessonPdf(deps(), input());
    expect(second).toMatchObject({ cached: true, key: first?.key });
    const streamed = new Uint8Array(
      await new Response(second?.body as ReadableStream).arrayBuffer()
    );
    expect(streamed).toEqual(bytes);
    expect(second?.size).toBe(bytes.byteLength);
  });

  it("answers null for an unknown lesson", async () => {
    expect(
      await exportLessonPdf(deps(), input({ lessonId: crypto.randomUUID() }))
    ).toBeNull();
  });

  it("gives a new key after a lesson edit, a teacher-info edit, a drawing replace, a keyword and a label change", async () => {
    const keys = new Set<string>();
    const remember = async (over: Partial<ExportInput> = {}) => {
      const result = await exportLessonPdf(deps(), input(over));
      expect(result?.cached).toBe(false);
      keys.add(result?.key ?? "");
    };
    await remember({ template: "participants" });
    // A lesson edit (a note).
    await save((stored) => ({
      translations: {
        ...stored.translations,
        nl: { notes: "Anders", title: "Les drie" },
      },
    }));
    await remember({ template: "participants" });
    // A teacher-info edit bumps its version.
    await env.DB.prepare(
      "UPDATE gesture_teacher_info SET hc = 'andere vorm', version = version + 1 WHERE gesture_id = ? AND locale = 'fr'"
    )
      .bind(hallo)
      .run();
    await remember({ template: "participants" });
    // A new drawing is a new object key.
    await drawing(hallo, 1, fromBase64(env.DRAWING_B64));
    await remember({ template: "participants" });
    await drawing(hallo, 1, fromBase64(env.DRAWING_B64));
    await remember({ template: "participants" });
    // A public keyword edit.
    await env.DB.prepare(
      "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES (?, 'fr', 'salut', 1)"
    )
      .bind(hallo)
      .run();
    await remember({ template: "participants" });
    // A gesture rename.
    await env.DB.prepare(
      "UPDATE gesture SET name = 'Hallo!', updated_at = 99 WHERE id = ?"
    )
      .bind(hallo)
      .run();
    await remember({ template: "participants" });
    // The labels (a translation edit).
    await remember({
      labels: { ...LABELS, fallbackFootnote: "† other" },
      template: "participants",
    });
    expect(keys.size).toBe(8);
    // Template and language are in the key too.
    const other = await exportLessonPdf(deps(), input({ locale: "en" }));
    expect(other?.key).toMatch(ENGLISH_TEACHERS);
  });

  it("falls back per field, marks the row and skips unpublished gestures (listed)", async () => {
    const preview = await previewLessonExport(testDb(), {
      lessonId,
      locale: "fr",
      template: "teachers",
    });
    expect(preview).toMatchObject({
      gestures: 2,
      limit: LESSON_PDF_LIMITS.teachers,
      overLimit: false,
      skipped: [{ id: hidden, name: "Verborgen" }],
    });
    // Hallo: the word falls back (no fr name), PL and BW come from nl; Dag has no fr info at all.
    const byId = new Map(preview?.issues.map((issue) => [issue.id, issue]));
    expect(byId.get(hallo)).toMatchObject({ fallback: true, missing: false });
    expect(byId.get(dag)).toMatchObject({ fallback: true });
    const dutch = await previewLessonExport(testDb(), {
      lessonId,
      locale: "nl",
      template: "teachers",
    });
    expect(dutch?.issues).toEqual([]);
  });

  it("previews the participants' gaps: no drawing, an unsupported WebP, nothing to print", async () => {
    await drawing(hallo, 1, fromBase64(env.DRAWING_B64));
    await env.DB.prepare(
      "DELETE FROM gesture_teacher_info WHERE gesture_id = ?"
    )
      .bind(dag)
      .run();
    await env.DB.prepare("DELETE FROM gesture_keyword WHERE gesture_id = ?")
      .bind(dag)
      .run();
    await drawing(dag, 1, new Uint8Array([1, 2, 3]), "image/webp");
    const preview = await previewLessonExport(testDb(), {
      lessonId,
      locale: "nl",
      template: "participants",
    });
    const byId = new Map(preview?.issues.map((issue) => [issue.id, issue]));
    expect(byId.get(hallo)).toBeUndefined();
    expect(byId.get(dag)).toMatchObject({
      fallback: false,
      missing: true,
      noDrawing: false,
      unsupportedDrawing: true,
    });
  });

  it("flags text the PDF font lacks in the preview and counts the replaced characters of a render", async () => {
    const before = await previewLessonExport(testDb(), {
      lessonId,
      locale: "nl",
      template: "teachers",
    });
    expect(before?.unsupportedLessonText).toBe(false);
    expect(before?.issues.some((issue) => issue.unsupportedText)).toBe(false);
    await env.DB.prepare("UPDATE gesture SET name = ? WHERE id = ?")
      .bind("مرحبا", hallo)
      .run();
    await env.DB.prepare("UPDATE lesson SET version = version + 1 WHERE id = ?")
      .bind(lessonId)
      .run();
    const preview = await previewLessonExport(testDb(), {
      lessonId,
      locale: "nl",
      template: "teachers",
    });
    const byId = new Map(preview?.issues.map((issue) => [issue.id, issue]));
    expect(byId.get(hallo)).toMatchObject({ unsupportedText: true });
    expect(byId.get(dag)).toBeUndefined();
    const result = await exportLessonPdf(deps(), input({ locale: "nl" }));
    expect(result).toMatchObject({
      cached: false,
      replacedCharacters: 5,
      truncatedRows: 0,
    });
  });

  it("embeds PNG and JPEG drawings and reports a WebP as dropped, not as a failure", async () => {
    await drawing(hallo, 1, fromBase64(env.DRAWING_B64));
    await drawing(hallo, 2, fromBase64(env.DRAWING_JPG_B64), "image/jpeg");
    await drawing(dag, 1, new Uint8Array([1, 2, 3]), "image/webp");
    const result = await exportLessonPdf(
      deps(),
      input({ locale: "nl", template: "participants" })
    );
    expect(result).toMatchObject({ cached: false, droppedDrawings: 1 });
    await PDFDocument.load(result?.body as Uint8Array);
  });

  it("refuses a lesson over the cap with the limit, for both templates", async () => {
    const statements = [] as D1PreparedStatement[];
    const ids: string[] = [];
    for (let at = 0; at < 151; at += 1) {
      const id = crypto.randomUUID();
      ids.push(id);
      statements.push(
        env.DB.prepare(
          "INSERT INTO gesture (id, slug, name, sort_name, playback_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pb', 1, 1, 1)"
        ).bind(id, `bulk-${at}-${id.slice(0, 6)}`, `Bulk ${at}`, `bulk ${at}`)
      );
    }
    await env.DB.batch(statements);
    const items = ids.map((id, position) =>
      env.DB.prepare(
        "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES (?, NULL, ?, ?)"
      ).bind(lessonId, id, position + 10)
    );
    await env.DB.batch(items);
    await env.DB.prepare("UPDATE lesson SET version = version + 1 WHERE id = ?")
      .bind(lessonId)
      .run();
    for (const [template, limit] of [
      ["teachers", 150],
      ["participants", 80],
    ] as const) {
      const failure = await exportLessonPdf(deps(), input({ template })).catch(
        (error: unknown) => error
      );
      expect(failure).toBeInstanceOf(LessonExportError);
      expect(failure).toMatchObject({ code: "TOO_MANY", limit });
      const preview = await previewLessonExport(testDb(), {
        lessonId,
        locale: "nl",
        template,
      });
      expect(preview).toMatchObject({ gestures: 153, limit, overLimit: true });
    }
  });

  it("enforces the budget and the size cap, and caches neither failure", async () => {
    const slow = await exportLessonPdf(deps({ budgetMs: -1 }), input()).catch(
      (error: unknown) => error
    );
    expect(slow).toMatchObject({ code: "TIMEOUT" });
    const big = await exportLessonPdf(deps({ maxBytes: 100 }), input()).catch(
      (error: unknown) => error
    );
    expect(big).toMatchObject({ code: "TOO_LARGE", limit: 100 });
    const listed = await env.MEDIA.list({ prefix: "teacher/pdf/" });
    expect(listed.objects).toEqual([]);
  });

  it("asks the render limiter only for a render: a cached file is served when it refuses", async () => {
    const refusing = deps({ allowRender: () => Promise.resolve(false) });
    expect(
      await exportLessonPdf(refusing, input()).catch((e: unknown) => e)
    ).toMatchObject({
      code: "RATE_LIMITED",
    });
    await exportLessonPdf(deps(), input());
    expect(await exportLessonPdf(refusing, input())).toMatchObject({
      cached: true,
    });
  });

  it("falls back to a render when the cache cannot be written", async () => {
    const result = await exportLessonPdf(
      deps({
        media: new Proxy(env.MEDIA, {
          get(target, property) {
            if (property === "put") {
              return () => Promise.reject(new Error("r2 down"));
            }
            const value = Reflect.get(target, property) as unknown;
            return typeof value === "function"
              ? (value as (...args: unknown[]) => unknown).bind(target)
              : value;
          },
        }),
      }),
      input()
    );
    expect(result).toMatchObject({ cached: false });
  });
});

describe("recordLessonExport and the filename", () => {
  it("writes one audit entry with counts and no text", async () => {
    const mark = await auditMark();
    await recordLessonExport(testDb(), {
      actorId: author.user.id,
      cached: true,
      gestures: 2,
      lessonId,
      locale: "fr",
      skipped: 1,
      template: "teachers",
    });
    const rows = await auditRowsSince(mark);
    expect(rows).toEqual([
      {
        action: "lesson.export",
        actorId: author.user.id,
        data: {
          cached: true,
          gestures: 2,
          locale: "fr",
          skipped: 1,
          template: "teachers",
        },
        targetId: lessonId,
        targetType: "lesson",
      },
    ]);
  });

  it("names the file after the number and the language", () => {
    expect(lessonPdfFilename(3, "fr")).toBe("les-3-fr.pdf");
    expect(lessonPdfFilename(null, "pt-BR")).toBe("les-pt-BR.pdf");
  });
});
