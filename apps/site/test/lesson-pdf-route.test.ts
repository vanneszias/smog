// biome-ignore-all lint/performance/noAwaitInLoops: requests are made one after the other so each answer is read in order.
import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ORIGIN, signedUp } from "./helpers";

/*
 * Phase 10c task 5b: `GET /api/teacher/lessons/<id>/pdf` through the whole
 * stack (real Better Auth sessions in D1, the real route, the real engine in
 * workerd). A teacher or an admin gets the file, a guest, a learner, a
 * translator and a banned teacher do not; the second request is a cache hit;
 * a lesson or teacher-info edit makes a new key; renders are limited per user.
 */

if (!env.DB) {
  throw new Error("[test] The DB binding is missing");
}
const d1: D1Database = env.DB;
if (!env.MEDIA) {
  throw new Error("[test] The MEDIA binding is missing");
}
const media: R2Bucket = env.MEDIA;

const GESTURE_ID = "7d0c1a52-9a3e-4a0b-8a54-0f5f3c1b2f01";
const LESSON_ID = "7d0c1a52-9a3e-4a0b-8a54-0f5f3c1b2f02";

async function rpc(path: string, input: unknown, cookie: string) {
  const response = await exports.default.fetch(`${ORIGIN}/api/rpc/${path}`, {
    body: JSON.stringify({ json: input ?? {} }),
    headers: { "content-type": "application/json", cookie },
    method: "POST",
  });
  return {
    body: (await response.json().catch(() => ({}))) as { json?: unknown },
    status: response.status,
  };
}

type Held = "admin" | "teacher" | "translator" | null;

async function account(held: Held) {
  const signed = await signedUp();
  const me = (await rpc("account/me", {}, signed.cookie)).body.json as {
    id: string;
  };
  if (held === "admin") {
    await d1
      .prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(me.id)
      .run();
  } else if (held) {
    await d1
      .prepare(
        "INSERT INTO user_role (user_id, role, granted_at) VALUES (?, ?, ?)"
      )
      .bind(me.id, held, Date.now())
      .run();
  }
  return { ...signed, id: me.id };
}

function pdf(
  lessonId: string,
  query: string,
  cookie?: string
): Promise<Response> {
  return exports.default.fetch(
    `${ORIGIN}/api/teacher/lessons/${lessonId}/pdf?${query}`,
    {
      headers: {
        "cf-connecting-ip": crypto.randomUUID(),
        ...(cookie ? { cookie } : {}),
      },
    }
  );
}

const TEACHERS_NL = "template=teachers&locale=nl";

async function cachedKeys(lessonId = LESSON_ID): Promise<string[]> {
  const listed = await media.list({ prefix: `teacher/pdf/${lessonId}/` });
  return listed.objects.map((object) => object.key).sort();
}

async function exportAudits(lessonId = LESSON_ID) {
  const { results } = await d1
    .prepare(
      "SELECT data FROM audit_log WHERE action = 'lesson.export' AND target_id = ? ORDER BY rowid"
    )
    .bind(lessonId)
    .all<{ data: string }>();
  return results.map((row) => JSON.parse(row.data) as Record<string, unknown>);
}

let teacher: Awaited<ReturnType<typeof account>>;
let boss: Awaited<ReturnType<typeof account>>;

beforeAll(async () => {
  teacher = await account("teacher");
  boss = await account("admin");
  await d1
    .prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, published_at, created_at, updated_at) VALUES (?, 'pdf-route', 'Hallo', 'hallo', 'pb', 1, 1, 1)"
    )
    .bind(GESTURE_ID)
    .run();
  await d1.batch([
    d1
      .prepare(
        "INSERT INTO lesson (id, author_id, number, version, created_at, updated_at) VALUES (?, ?, 2, 1, 1, 1)"
      )
      .bind(LESSON_ID, teacher.id),
    d1
      .prepare(
        "INSERT INTO lesson_translation (lesson_id, locale, title, notes) VALUES (?, 'nl', 'Les twee', 'Notities')"
      )
      .bind(LESSON_ID),
    d1
      .prepare(
        "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES (?, NULL, ?, 0)"
      )
      .bind(LESSON_ID, GESTURE_ID),
    d1
      .prepare(
        "INSERT INTO gesture_teacher_info (gesture_id, locale, hc, version, updated_at) VALUES (?, 'nl', 'vlakke hand', 1, 1)"
      )
      .bind(GESTURE_ID),
  ]);
});

describe("who may download", () => {
  it("refuses a guest (401), a learner and a translator (403), whether or not the lesson exists", async () => {
    const learner = await account(null);
    const translator = await account("translator");
    for (const id of [LESSON_ID, crypto.randomUUID(), "not-a-uuid"]) {
      const guest = await pdf(id, TEACHERS_NL);
      expect(guest.status, id).toBe(401);
      expect(guest.headers.get("cache-control")).toBe("no-store");
      for (const cookie of [learner.cookie, translator.cookie]) {
        const refused = await pdf(id, TEACHERS_NL, cookie);
        expect(refused.status, id).toBe(403);
        expect(refused.headers.get("content-type")).not.toBe("application/pdf");
        await refused.text();
      }
      await guest.text();
    }
  });

  it("reads a banned teacher as a guest at once", async () => {
    const banned = await account("teacher");
    expect((await pdf(LESSON_ID, TEACHERS_NL, banned.cookie)).status).toBe(200);
    const ban = await rpc(
      "admin/users/ban",
      { reason: "Spam", userId: banned.id },
      boss.cookie
    );
    expect(ban.status).toBe(200);
    const after = await pdf(LESSON_ID, TEACHERS_NL, banned.cookie);
    expect(after.status).toBe(401);
    await after.text();
  });

  it("serves a teacher and an admin the attachment, private and never stored", async () => {
    for (const who of [teacher, boss]) {
      const response = await pdf(LESSON_ID, TEACHERS_NL, who.cookie);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="les-2-nl.pdf"'
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain(
        "sandbox"
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(Number(response.headers.get("content-length"))).toBe(
        bytes.byteLength
      );
    }
  });
});

describe("validation", () => {
  it("answers 400 for a bad template, a language that is not enabled and an id that is no UUID; 404 for an unknown lesson", async () => {
    const cases: [string, string, number][] = [
      [LESSON_ID, "template=other&locale=nl", 400],
      [LESSON_ID, "locale=nl", 400],
      [LESSON_ID, "template=teachers&locale=xx", 400],
      [LESSON_ID, "template=teachers", 400],
      ["not-a-uuid", TEACHERS_NL, 400],
      [crypto.randomUUID(), TEACHERS_NL, 404],
    ];
    for (const [id, query, status] of cases) {
      const response = await pdf(id, query, teacher.cookie);
      expect([id, query, response.status]).toEqual([id, query, status]);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await response.text();
    }
  });
});

describe("the cache and the audit", () => {
  it("renders once, then streams the same file, with one audit entry per download", async () => {
    const lessonId = crypto.randomUUID();
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO lesson (id, author_id, number, version, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)"
        )
        .bind(lessonId, teacher.id),
      d1
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title, notes) VALUES (?, 'nl', 'Cache', '')"
        )
        .bind(lessonId),
      d1
        .prepare(
          "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES (?, NULL, ?, 0)"
        )
        .bind(lessonId, GESTURE_ID),
    ]);
    const first = await pdf(
      lessonId,
      "template=participants&locale=nl",
      teacher.cookie
    );
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    expect(first.headers.get("content-disposition")).toContain("les-nl.pdf");
    const keys = await cachedKeys(lessonId);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(
      new RegExp(`^teacher/pdf/${lessonId}/[0-9a-f]{16}-participants-nl\\.pdf$`)
    );
    const second = await pdf(
      lessonId,
      "template=participants&locale=nl",
      teacher.cookie
    );
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(firstBytes);
    expect(await cachedKeys(lessonId)).toEqual(keys);
    expect(await exportAudits(lessonId)).toEqual([
      {
        cached: false,
        gestures: 1,
        locale: "nl",
        skipped: 0,
        template: "participants",
      },
      {
        cached: true,
        gestures: 1,
        locale: "nl",
        skipped: 0,
        template: "participants",
      },
    ]);

    // A lesson edit: a new file, the old one stays until the retention.
    await d1
      .prepare("UPDATE lesson SET version = version + 1 WHERE id = ?")
      .bind(lessonId)
      .run();
    await (
      await pdf(lessonId, "template=participants&locale=nl", teacher.cookie)
    ).arrayBuffer();
    expect(await cachedKeys(lessonId)).toHaveLength(2);

    // A teacher-info edit of a contained gesture.
    await d1
      .prepare(
        "UPDATE gesture_teacher_info SET hc = 'andere', version = version + 1 WHERE gesture_id = ? AND locale = 'nl'"
      )
      .bind(GESTURE_ID)
      .run();
    await (
      await pdf(lessonId, "template=participants&locale=nl", teacher.cookie)
    ).arrayBuffer();
    expect(await cachedKeys(lessonId)).toHaveLength(3);
    await d1
      .prepare(
        "UPDATE gesture_teacher_info SET hc = 'vlakke hand', version = version + 1 WHERE gesture_id = ? AND locale = 'nl'"
      )
      .bind(GESTURE_ID)
      .run();
  });
});

describe("limits", () => {
  it("limits renders per user (cache hits are free) and refuses a lesson over the cap", async () => {
    const author = await account("teacher");
    const lessonId = crypto.randomUUID();
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO lesson (id, author_id, number, version, created_at, updated_at) VALUES (?, ?, 9, 1, 1, 1)"
        )
        .bind(lessonId, author.id),
      d1
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title, notes) VALUES (?, 'nl', 'Limiet', '')"
        )
        .bind(lessonId),
    ]);
    const combos = [
      "template=teachers&locale=nl",
      "template=teachers&locale=en",
      "template=teachers&locale=fr",
      "template=participants&locale=nl",
      "template=participants&locale=en",
    ];
    for (const query of combos) {
      const response = await pdf(lessonId, query, author.cookie);
      expect([query, response.status]).toEqual([query, 200]);
      await response.arrayBuffer();
    }
    // The sixth distinct render in a minute is refused, a repeat is a cache hit.
    const refused = await pdf(
      lessonId,
      "template=participants&locale=fr",
      author.cookie
    );
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED" });
    const repeat = await pdf(lessonId, TEACHERS_NL, author.cookie);
    expect(repeat.status).toBe(200);
    await repeat.arrayBuffer();
  });

  it("answers 422 TOO_MANY with the limit for a participants' lesson of 81 gestures", async () => {
    const author = await account("teacher");
    const lessonId = crypto.randomUUID();
    const ids = Array.from({ length: 81 }, () => crypto.randomUUID());
    await d1.batch([
      d1
        .prepare(
          "INSERT INTO lesson (id, author_id, number, version, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)"
        )
        .bind(lessonId, author.id),
      d1
        .prepare(
          "INSERT INTO lesson_translation (lesson_id, locale, title, notes) VALUES (?, 'nl', 'Te groot', '')"
        )
        .bind(lessonId),
    ]);
    await d1.batch(
      ids.map((id, index) =>
        d1
          .prepare(
            "INSERT INTO gesture (id, slug, name, sort_name, playback_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pb', 1, 1, 1)"
          )
          .bind(
            id,
            `many-${index}-${id.slice(0, 6)}`,
            `Veel ${index}`,
            `veel ${index}`
          )
      )
    );
    await d1.batch(
      ids.map((id, index) =>
        d1
          .prepare(
            "INSERT INTO lesson_item (lesson_id, section_id, gesture_id, position) VALUES (?, NULL, ?, ?)"
          )
          .bind(lessonId, id, index)
      )
    );
    const response = await pdf(
      lessonId,
      "template=participants&locale=nl",
      author.cookie
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      code: "TOO_MANY",
      count: 81,
      limit: 80,
    });
    const teachers = await pdf(lessonId, TEACHERS_NL, author.cookie);
    expect(teachers.status).toBe(200);
    await teachers.arrayBuffer();
  });
});
