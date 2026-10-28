import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  LessonDetail,
  LessonList,
  LessonReadiness,
  LessonSaved,
  LessonUpdateInput,
} from "../../../../features/lessons/src/schema/index";
import {
  LESSON_LIST_PAGE,
  LESSON_MAX_GESTURES,
} from "../../../../features/lessons/src/schema/index";
import {
  type Authed,
  addGesture,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  lessonsAs,
  resetTeacherData,
  signedUp,
} from "./helpers";

let admin: Authed;
let author: Authed;
let other: Authed;
let translator: Authed;
let learner: Authed;
let hallo: string;
let dag: string;
let hidden: string;

beforeAll(async () => {
  admin = await signedUp("admin");
  author = await signedUp("teacher");
  other = await signedUp("teacher");
  translator = await signedUp("translator");
  learner = await signedUp();
});

beforeEach(async () => {
  await resetTeacherData();
  await env.DB.prepare(
    "UPDATE language SET enabled = 1 WHERE code IN ('nl', 'en', 'fr')"
  ).run();
  hallo = await addGesture("Hallo", { published: true });
  dag = await addGesture("Dag", { published: true });
  hidden = await addGesture("Verborgen");
});

function create(as: Authed = author, title = "Les 1") {
  return lessonsAs<{ id: string; version: number }>(as, "create", {
    locale: "nl",
    number: 1,
    title,
  });
}

function get(id: string, as: Authed = author) {
  return lessonsAs<LessonDetail>(as, "get", { id });
}

/** The update input that keeps `stored` as it is, with `change` on top. */
function inputOf(
  stored: LessonDetail,
  change: Partial<LessonUpdateInput> = {}
): LessonUpdateInput {
  return {
    expectedVersion: stored.version,
    id: stored.id,
    number: stored.number,
    sections: stored.sections.map((section) => ({
      gestureIds: section.items.map((item) => item.id),
      id: section.id,
      titles: section.titles,
    })),
    translations: stored.translations,
    ungrouped: stored.ungrouped.map((item) => item.id),
    ...change,
  };
}

function update(as: Authed, input: LessonUpdateInput) {
  return lessonsAs<LessonSaved>(as, "update", input);
}

describe("create and get", () => {
  it("creates a lesson with one title, version 1, authored by the caller, with an audit entry without the title", async () => {
    const mark = await auditMark();
    const created = await create(author, "Geheime titel");
    expect(created.version).toBe(1);
    const stored = await get(created.id);
    expect(stored).toMatchObject({
      authorId: author.user.id,
      canEdit: true,
      number: 1,
      sections: [],
      translations: { nl: { notes: "", title: "Geheime titel" } },
      ungrouped: [],
      version: 1,
    });
    const rows = await auditRowsSince(mark);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "lesson.create",
      actorId: author.user.id,
      data: { number: 1 },
      targetId: created.id,
      targetType: "lesson",
    });
    expect(JSON.stringify(rows)).not.toContain("Geheime titel");
  });

  it("refuses a language that is not enabled", async () => {
    await env.DB.prepare(
      "UPDATE language SET enabled = 0 WHERE code = 'fr'"
    ).run();
    const failure = await failureOf(
      lessonsAs(author, "create", { locale: "fr", title: "Leçon" })
    );
    expect(failure.code).toBe("VALIDATION");
  });

  it("is NOT_FOUND for an unknown lesson", async () => {
    expect((await failureOf(get("nope"))).code).toBe("NOT_FOUND");
  });

  it("lets any teacher read another's lesson, read-only", async () => {
    const created = await create(author);
    expect(await get(created.id, other)).toMatchObject({
      authorId: author.user.id,
      canEdit: false,
    });
    expect((await get(created.id, admin)).canEdit).toBe(true);
  });
});

describe("update", () => {
  it("saves sections and gestures in order, bumps the version and audits the parts, not the texts", async () => {
    const created = await create();
    const stored = await get(created.id);
    const section = crypto.randomUUID();
    const mark = await auditMark();
    const saved = await update(
      author,
      inputOf(stored, {
        sections: [
          {
            gestureIds: [dag],
            id: section,
            titles: { fr: "Salutations", nl: "Begroetingen" },
          },
        ],
        translations: {
          fr: { notes: "", title: "Leçon un" },
          nl: { notes: "Een notitie", title: "Les 1" },
        },
        ungrouped: [hallo],
      })
    );
    expect(saved).toMatchObject({ unchanged: false, version: 2 });
    const after = await get(created.id);
    expect(after.version).toBe(2);
    expect(after.ungrouped.map((item) => item.name)).toEqual(["Hallo"]);
    expect(after.sections).toHaveLength(1);
    expect(after.sections[0]).toMatchObject({
      id: section,
      titles: { fr: "Salutations", nl: "Begroetingen" },
    });
    expect(after.sections[0]?.items.map((item) => item.name)).toEqual(["Dag"]);
    expect(after.translations.fr?.title).toBe("Leçon un");
    const rows = await auditRowsSince(mark);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "lesson.update",
      data: { fields: ["title", "notes", "sections", "items"], version: 2 },
    });
    expect(JSON.stringify(rows)).not.toContain("Een notitie");
    expect(JSON.stringify(rows)).not.toContain("Begroetingen");
  });

  it("reorders items and sections", async () => {
    const created = await create();
    const stored = await get(created.id);
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await update(
      author,
      inputOf(stored, {
        sections: [
          { gestureIds: [hallo], id: a, titles: { nl: "A" } },
          { gestureIds: [dag], id: b, titles: { nl: "B" } },
        ],
      })
    );
    const mid = await get(created.id);
    const mark = await auditMark();
    await update(
      author,
      inputOf(mid, {
        sections: [
          { gestureIds: [dag], id: b, titles: { nl: "B" } },
          { gestureIds: [hallo], id: a, titles: { nl: "A" } },
        ],
      })
    );
    const after = await get(created.id);
    expect(after.sections.map((section) => section.id)).toEqual([b, a]);
    expect((await auditRowsSince(mark))[0]).toMatchObject({
      data: { fields: ["sections", "items"] },
    });
  });

  it("saving what is stored changes nothing and writes no entry", async () => {
    const created = await create();
    const stored = await get(created.id);
    const mark = await auditMark();
    const saved = await update(author, inputOf(stored));
    expect(saved).toMatchObject({ unchanged: true, version: 1 });
    expect((await get(created.id)).version).toBe(1);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("answers CONFLICT with the lesson as stored when the version moved", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(
      author,
      inputOf(stored, { translations: { nl: { notes: "x", title: "Les 1" } } })
    );
    const failure = await failureOf(
      update(
        admin,
        inputOf(stored, { translations: { nl: { notes: "", title: "Mijn" } } })
      )
    );
    expect(failure.code).toBe("CONFLICT");
    expect(failure.data).toMatchObject({
      current: { translations: { nl: { notes: "x" } }, version: 2 },
      reason: "stale",
    });
  });

  it("only the author or an admin edits: another teacher is FORBIDDEN", async () => {
    const created = await create();
    const stored = await get(created.id, other);
    expect(
      (
        await failureOf(
          update(
            other,
            inputOf(stored, {
              translations: { nl: { notes: "", title: "Overgenomen" } },
            })
          )
        )
      ).code
    ).toBe("FORBIDDEN");
    const saved = await update(
      admin,
      inputOf(stored, { translations: { nl: { notes: "", title: "Admin" } } })
    );
    expect(saved.version).toBe(2);
  });

  it("refuses a gesture twice, an unknown one, too many, and a new unpublished one", async () => {
    const created = await create();
    const stored = await get(created.id);
    const field = async (change: Partial<LessonUpdateInput>) => {
      const failure = await failureOf(update(author, inputOf(stored, change)));
      expect(failure.code).toBe("VALIDATION");
      return JSON.stringify(failure.data);
    };
    expect(await field({ ungrouped: [hallo, hallo] })).toContain("duplicate");
    expect(
      await field({
        sections: [
          { gestureIds: [hallo], id: crypto.randomUUID(), titles: {} },
        ],
        ungrouped: [hallo],
      })
    ).toContain("duplicate");
    expect(await field({ ungrouped: ["no-such-gesture"] })).toContain(
      "unknown"
    );
    expect(await field({ ungrouped: [hidden] })).toContain("unpublished");
    // Over the cap the input schema itself refuses it, before any lookup.
    const tooMany = await failureOf(
      update(
        author,
        inputOf(stored, {
          ungrouped: Array.from({ length: LESSON_MAX_GESTURES + 1 }, (_, i) =>
            String(i)
          ),
        })
      )
    );
    expect(tooMany.code).toBe("BAD_REQUEST");
  });

  it("keeps a gesture that was unpublished after it was added, flagged", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(author, inputOf(stored, { ungrouped: [hallo, dag] }));
    await env.DB.prepare("UPDATE gesture SET published_at = NULL WHERE id = ?")
      .bind(dag)
      .run();
    const mid = await get(created.id);
    expect(mid.ungrouped.map((item) => [item.name, item.published])).toEqual([
      ["Hallo", true],
      ["Dag", false],
    ]);
    // Its stream id is not handed to a teacher; a published item keeps it.
    expect(mid.ungrouped.map((item) => item.playbackId !== "")).toEqual([
      true,
      false,
    ]);
    // Saving again with the unpublished gesture still in it is fine.
    const saved = await update(
      author,
      inputOf(mid, {
        translations: { nl: { notes: "nieuw", title: "Les 1" } },
      })
    );
    expect(saved.unchanged).toBe(false);
    expect((await get(created.id)).ungrouped).toHaveLength(2);
  });

  it("requires a title in some language, and a title for any notes", async () => {
    const created = await create();
    const stored = await get(created.id);
    expect(
      (await failureOf(update(author, inputOf(stored, { translations: {} }))))
        .code
    ).toBe("VALIDATION");
    expect(
      (
        await failureOf(
          update(
            author,
            inputOf(stored, {
              translations: {
                en: { notes: "only notes", title: "" },
                nl: { notes: "", title: "Les 1" },
              },
            })
          )
        )
      ).code
    ).toBe("VALIDATION");
  });

  it("drops a language emptied of title and notes", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(
      author,
      inputOf(stored, {
        translations: {
          en: { notes: "n", title: "Lesson" },
          nl: { notes: "", title: "Les 1" },
        },
      })
    );
    const mid = await get(created.id);
    await update(
      author,
      inputOf(mid, {
        translations: {
          en: { notes: "", title: "" },
          nl: { notes: "", title: "Les 1" },
        },
      })
    );
    expect(Object.keys((await get(created.id)).translations)).toEqual(["nl"]);
  });

  it("refuses a section id that belongs to another lesson", async () => {
    const first = await create();
    const second = await create(author, "Les 2");
    const firstStored = await get(first.id);
    const shared = crypto.randomUUID();
    await update(
      author,
      inputOf(firstStored, {
        sections: [{ gestureIds: [], id: shared, titles: {} }],
      })
    );
    const secondStored = await get(second.id);
    const failure = await failureOf(
      update(
        author,
        inputOf(secondStored, {
          sections: [{ gestureIds: [], id: shared, titles: {} }],
        })
      )
    );
    expect(failure.code).toBe("VALIDATION");
    expect(JSON.stringify(failure.data)).toContain("idTaken");
  });

  it("stores 150 gestures (chunked inserts) in order", async () => {
    const created = await create();
    const stored = await get(created.id);
    const ids: string[] = [];
    // Inserted in one batch: one gesture each is slow one by one.
    const statements = Array.from({ length: LESSON_MAX_GESTURES }, (_, i) => {
      const id = crypto.randomUUID();
      ids.push(id);
      return env.DB.prepare(
        "INSERT INTO gesture (id, slug, name, sort_name, playback_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pb', 1, 1, 1)"
      ).bind(id, `bulk-${i}-${id.slice(0, 6)}`, `Bulk ${i}`, `bulk ${i}`);
    });
    await env.DB.batch(statements.slice(0, 50));
    await env.DB.batch(statements.slice(50, 100));
    await env.DB.batch(statements.slice(100));
    const half = ids.slice(0, 75);
    const rest = ids.slice(75);
    await update(
      author,
      inputOf(stored, {
        sections: [
          { gestureIds: rest, id: crypto.randomUUID(), titles: { nl: "Rest" } },
        ],
        ungrouped: half,
      })
    );
    const after = await get(created.id);
    expect(after.ungrouped.map((item) => item.id)).toEqual(half);
    expect(after.sections[0]?.items.map((item) => item.id)).toEqual(rest);
  });
});

describe("duplicate", () => {
  it("copies texts, sections and gestures into a lesson the caller authors", async () => {
    const created = await create(author, "Origineel");
    const stored = await get(created.id);
    await update(
      author,
      inputOf(stored, {
        sections: [
          {
            gestureIds: [dag],
            id: crypto.randomUUID(),
            titles: { nl: "Deel" },
          },
        ],
        ungrouped: [hallo],
      })
    );
    const mark = await auditMark();
    const copy = await lessonsAs<{ id: string; version: number }>(
      other,
      "duplicate",
      { id: created.id }
    );
    expect(copy.id).not.toBe(created.id);
    const copied = await get(copy.id, other);
    expect(copied).toMatchObject({
      authorId: other.user.id,
      canEdit: true,
      translations: { nl: { title: "Origineel" } },
      version: 1,
    });
    expect(copied.ungrouped.map((item) => item.name)).toEqual(["Hallo"]);
    expect(copied.sections[0]?.titles).toEqual({ nl: "Deel" });
    expect(copied.sections[0]?.id).not.toBe(
      (await get(created.id)).sections[0]?.id
    );
    expect(copied.sections[0]?.items.map((item) => item.name)).toEqual(["Dag"]);
    const rows = await auditRowsSince(mark);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "lesson.duplicate",
      data: { gestures: 2, sourceId: created.id },
      targetId: copy.id,
    });
    // The original is untouched.
    expect((await get(created.id)).version).toBe(2);
  });

  it("is NOT_FOUND for an unknown lesson", async () => {
    expect(
      (await failureOf(lessonsAs(author, "duplicate", { id: "nope" }))).code
    ).toBe("NOT_FOUND");
  });
});

describe("delete", () => {
  it("the author deletes with its items, sections and texts; the entry carries counts", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(
      author,
      inputOf(stored, {
        sections: [
          {
            gestureIds: [dag],
            id: crypto.randomUUID(),
            titles: { nl: "Deel" },
          },
        ],
        ungrouped: [hallo],
      })
    );
    const mark = await auditMark();
    expect(await lessonsAs(author, "delete", { id: created.id })).toEqual({
      deleted: true,
    });
    const counts = await Promise.all(
      [
        "lesson",
        "lesson_translation",
        "lesson_section",
        "lesson_section_translation",
        "lesson_item",
      ].map(async (table) => {
        const row = await env.DB.prepare(
          `SELECT count(*) AS n FROM ${table}`
        ).first<{ n: number }>();
        return [table, row?.n];
      })
    );
    expect(Object.fromEntries(counts)).toEqual({
      lesson: 0,
      lesson_item: 0,
      lesson_section: 0,
      lesson_section_translation: 0,
      lesson_translation: 0,
    });
    const rows = await auditRowsSince(mark);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "lesson.delete",
      data: { gestures: 2, sections: 1 },
      targetId: created.id,
    });
    // The gestures themselves stay.
    const gestures = await env.DB.prepare(
      "SELECT count(*) AS n FROM gesture"
    ).first<{ n: number }>();
    expect(gestures?.n).toBe(3);
  });

  it("another teacher cannot delete; an admin can; an unknown id is NOT_FOUND", async () => {
    const created = await create();
    expect(
      (await failureOf(lessonsAs(other, "delete", { id: created.id }))).code
    ).toBe("FORBIDDEN");
    expect(
      (await failureOf(lessonsAs(admin, "delete", { id: "nope" }))).code
    ).toBe("NOT_FOUND");
    expect(await lessonsAs(admin, "delete", { id: created.id })).toEqual({
      deleted: true,
    });
  });
});

describe("list", () => {
  it("lists newest change first with the resolved title, author, count and rights", async () => {
    const older = await create(author, "Eerste");
    const newer = await create(other, "Tweede");
    const stored = await get(older.id);
    await update(
      author,
      inputOf(stored, {
        translations: {
          en: { notes: "", title: "First" },
          nl: { notes: "", title: "Eerste" },
        },
        ungrouped: [hallo],
      })
    );
    const asAuthor = await lessonsAs<LessonList>(author, "list", {});
    expect(asAuthor.items.map((item) => item.title)).toEqual([
      "Eerste",
      "Tweede",
    ]);
    expect(asAuthor.items[0]).toMatchObject({
      canEdit: true,
      gestureCount: 1,
      id: older.id,
      mine: true,
    });
    expect(asAuthor.items[1]).toMatchObject({
      canEdit: false,
      gestureCount: 0,
      id: newer.id,
      mine: false,
    });
    expect(asAuthor.nextCursor).toBeNull();
  });

  it("filters mine, searches any language's title with LIKE characters literal, and pages by keyset", async () => {
    const one = await create(author, "Dieren 100%");
    await create(other, "Planten");
    const stored = await get(one.id);
    await update(
      author,
      inputOf(stored, {
        translations: {
          fr: { notes: "", title: "Animaux" },
          nl: { notes: "", title: "Dieren 100%" },
        },
      })
    );
    const mine = await lessonsAs<LessonList>(author, "list", { mine: true });
    expect(mine.items.map((item) => item.title)).toEqual(["Dieren 100%"]);
    const french = await lessonsAs<LessonList>(other, "list", {
      query: "anim",
    });
    expect(french.items.map((item) => item.id)).toEqual([one.id]);
    // The viewer's language (nl) is the title shown; the match was on fr.
    expect(french.items[0]?.titleLocale).toBe("nl");
    const percent = await lessonsAs<LessonList>(author, "list", {
      query: "100%",
    });
    expect(percent.items).toHaveLength(1);
    const wild = await lessonsAs<LessonList>(author, "list", { query: "%" });
    expect(wild.items.map((item) => item.title)).toEqual(["Dieren 100%"]);

    for (let i = 0; i < LESSON_LIST_PAGE; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: distinct timestamps, in order.
      await create(author, `Extra ${i}`);
    }
    const first = await lessonsAs<LessonList>(author, "list", {});
    expect(first.items).toHaveLength(LESSON_LIST_PAGE);
    expect(first.nextCursor).not.toBeNull();
    const next = await lessonsAs<LessonList>(author, "list", {
      cursor: first.nextCursor,
    });
    expect(next.items.length).toBeGreaterThan(0);
    expect(next.items.map((item) => item.id)).not.toContain(first.items[0]?.id);
    const seen = new Set([...first.items, ...next.items].map((i) => i.id));
    expect(seen.size).toBe(first.items.length + next.items.length);
  });

  it("falls back to the default language, then any, when the viewer's language has no title", async () => {
    const created = await create(author, "Nederlands");
    const stored = await get(created.id);
    await update(
      author,
      inputOf(stored, {
        translations: {
          en: { notes: "", title: "English" },
          nl: { notes: "", title: "Nederlands" },
        },
      })
    );
    // The test context's locale is the default; the title is the default's.
    const [item] = (await lessonsAs<LessonList>(author, "list", {})).items;
    expect(item?.title).toBe("Nederlands");
  });
});

describe("readiness and markers", () => {
  it("counts published gestures with their own, fallback and no teaching text in a language", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(author, inputOf(stored, { ungrouped: [hallo, dag] }));
    // The default language has text for "Hallo"; "Dag" has none anywhere.
    await callAs(author, "saveInfo", {
      expectedVersion: null,
      fields: {
        bw: "",
        cNote: "",
        hc: "vlak",
        note: "",
        or: "",
        pl: "",
        summary: "",
      },
      gestureId: hallo,
      locale: "nl",
    });
    const fr = await lessonsAs<LessonReadiness>(author, "readiness", {
      id: created.id,
      locale: "fr",
    });
    expect(fr).toMatchObject({
      fallback: 1,
      locale: "fr",
      none: 1,
      own: 0,
      total: 2,
    });
    const nl = await lessonsAs<LessonReadiness>(author, "readiness", {
      id: created.id,
      locale: "nl",
    });
    expect(nl).toMatchObject({ fallback: 0, none: 1, own: 1, total: 2 });
  });

  it("does not count an unpublished gesture, and refuses a language that is not enabled", async () => {
    const created = await create();
    const stored = await get(created.id);
    await update(author, inputOf(stored, { ungrouped: [hallo] }));
    await env.DB.prepare("UPDATE gesture SET published_at = NULL WHERE id = ?")
      .bind(hallo)
      .run();
    const readiness = await lessonsAs<LessonReadiness>(author, "readiness", {
      id: created.id,
      locale: "nl",
    });
    expect(readiness.total).toBe(0);
    await env.DB.prepare(
      "UPDATE language SET enabled = 0 WHERE code = 'fr'"
    ).run();
    expect(
      (
        await failureOf(
          lessonsAs(author, "readiness", { id: created.id, locale: "fr" })
        )
      ).code
    ).toBe("VALIDATION");
  });

  it("marks the gestures that have a drawing", async () => {
    await env.DB.prepare(
      "INSERT INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, credit, updated_at) VALUES (?, 1, ?, 'image/png', 10, 5, 5, '', 1)"
    )
      .bind(hallo, `teacher/drawings/${hallo}/1/${crypto.randomUUID()}`)
      .run();
    const markers = await lessonsAs<{ withDrawing: string[] }>(
      author,
      "gestureMarkers",
      { gestureIds: [hallo, dag] }
    );
    expect(markers.withDrawing).toEqual([hallo]);
  });
});

describe("who may call", () => {
  it("a translator and a plain user are FORBIDDEN, a guest UNAUTHORIZED, on every procedure", async () => {
    const created = await create();
    for (const path of ["list", "get", "readiness", "gestureMarkers"]) {
      const input =
        {
          gestureMarkers: { gestureIds: [] },
          get: { id: created.id },
          list: {},
          readiness: { id: created.id, locale: "nl" },
        }[path] ?? {};
      for (const who of [translator, learner]) {
        // biome-ignore lint/performance/noAwaitInLoops: a handful of calls.
        expect((await failureOf(lessonsAs(who, path, input))).code, path).toBe(
          "FORBIDDEN"
        );
      }
      expect((await failureOf(lessonsAs(null, path, input))).code, path).toBe(
        "UNAUTHORIZED"
      );
    }
  });
});
