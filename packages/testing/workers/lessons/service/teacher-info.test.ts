import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  TeacherInfoDetail,
  TeacherInfoFields,
  TeacherInfoSaved,
} from "../../../../features/lessons/src/schema/index";
import { EMPTY_TEACHER_INFO } from "../../../../features/lessons/src/schema/index";
import { teacherInfoCoverage } from "../../../../features/lessons/src/server/index";
import {
  type Authed,
  addGesture,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  resetTeacherData,
  signedUp,
  testDb,
} from "./helpers";

let admin: Authed;
let teacher: Authed;
let translator: Authed;
let both: Authed;
let learner: Authed;
let gestureId: string;

beforeAll(async () => {
  admin = await signedUp("admin");
  teacher = await signedUp("teacher");
  translator = await signedUp("translator");
  both = await signedUp("translator", "teacher");
  learner = await signedUp();
});

beforeEach(async () => {
  await resetTeacherData();
  await env.DB.prepare(
    "UPDATE language SET enabled = 1 WHERE code IN ('nl', 'en', 'fr')"
  ).run();
  gestureId = await addGesture("Hallo");
});

const NL: TeacherInfoFields = {
  ...EMPTY_TEACHER_INFO,
  bw: "naar voor",
  cNote: "op lettergrepen",
  hc: "vlakke hand",
  note: "(niet bij kinderen)",
  or: "palm naar boven",
  pl: "voor de borst",
  summary: "groeten",
};

function info(gesture = gestureId): Promise<TeacherInfoDetail> {
  return callAs<TeacherInfoDetail>(teacher, "getInfo", { gestureId: gesture });
}

function save(
  as: Authed | null,
  locale: string,
  fields: Partial<TeacherInfoFields>,
  expectedVersion: number | null,
  gesture = gestureId
) {
  return callAs<TeacherInfoSaved>(as, "saveInfo", {
    expectedVersion,
    fields: { ...EMPTY_TEACHER_INFO, ...fields },
    gestureId: gesture,
    locale,
  });
}

describe("teacher.getInfo", () => {
  it("answers a teacher, a translator and an admin; refuses a guest and a learner", async () => {
    const details = await Promise.all(
      [teacher, translator, admin, both].map((who) =>
        callAs<TeacherInfoDetail>(who, "getInfo", { gestureId })
      )
    );
    for (const detail of details) {
      expect(detail.gesture).toMatchObject({ id: gestureId, name: "Hallo" });
    }
    expect((await failureOf(callAs(null, "getInfo", { gestureId }))).code).toBe(
      "UNAUTHORIZED"
    );
    expect(
      (await failureOf(callAs(learner, "getInfo", { gestureId }))).code
    ).toBe("FORBIDDEN");
  });

  it("is NOT_FOUND for an unknown gesture", async () => {
    expect(
      (await failureOf(callAs(teacher, "getInfo", { gestureId: "nope" }))).code
    ).toBe("NOT_FOUND");
  });

  it("shows no rows for a gesture without information, the default language and the public keywords", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO gesture_keyword (gesture_id, locale, keyword, position) VALUES (?, 'nl', 'dag', 0), (?, 'nl', 'goeiedag', 1), (?, 'fr', 'bonjour', 0)"
      ).bind(gestureId, gestureId, gestureId),
    ]);
    const detail = await info();
    expect(detail.rows).toEqual({});
    expect(detail.defaultLocale).toBe("nl");
    expect(detail.keywords).toEqual({
      fr: ["bonjour"],
      nl: ["dag", "goeiedag"],
    });
    expect(detail.gesture.published).toBe(false);
  });

  it("returns every stored language with its version", async () => {
    await save(teacher, "nl", NL, null);
    await save(teacher, "fr", { hc: "main plate" }, null);
    const detail = await info();
    expect(Object.keys(detail.rows).sort()).toEqual(["fr", "nl"]);
    expect(detail.rows.nl).toMatchObject({ ...NL, version: 1 });
    expect(detail.rows.fr).toMatchObject({ hc: "main plate", version: 1 });
  });
});

describe("teacher.saveInfo", () => {
  it("creates a row (version 1) with one audit entry that holds no text", async () => {
    const mark = await auditMark();
    expect(await save(teacher, "fr", NL, null)).toEqual({ version: 1 });
    const audit = await auditRowsSince(mark);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "teacher.info_save",
      actorId: teacher.user.id,
      targetId: `${gestureId}:fr`,
      targetType: "gesture_teacher_info",
    });
    expect(audit[0]?.data).toEqual({
      fields: ["hc", "pl", "or", "bw", "cNote", "note", "summary"],
      locale: "fr",
      version: 1,
    });
    expect(JSON.stringify(audit)).not.toContain("vlakke");
  });

  it("bumps the version and lists only the changed fields", async () => {
    await save(teacher, "nl", NL, null);
    const mark = await auditMark();
    expect(await save(teacher, "nl", { ...NL, pl: "bij het oor" }, 1)).toEqual({
      version: 2,
    });
    const [entry] = await auditRowsSince(mark);
    expect(entry?.data).toEqual({ fields: ["pl"], locale: "nl", version: 2 });
    expect((await info()).rows.nl).toMatchObject({
      pl: "bij het oor",
      version: 2,
    });
  });

  it("is a stale lock: a save from an old version is CONFLICT with the stored row and writes nothing", async () => {
    await save(teacher, "nl", NL, null);
    await save(admin, "nl", { ...NL, hc: "gebogen hand" }, 1);
    const mark = await auditMark();
    const failure = await failureOf(
      save(teacher, "nl", { ...NL, hc: "mijn tekst" }, 1)
    );
    expect(failure.code).toBe("CONFLICT");
    expect(failure.data).toMatchObject({
      current: { hc: "gebogen hand", version: 2 },
      reason: "stale",
    });
    expect(await auditRowsSince(mark)).toEqual([]);
    expect((await info()).rows.nl?.hc).toBe("gebogen hand");
  });

  it("reads 'no row' as a version too: creating over a row somebody else created is CONFLICT", async () => {
    await save(admin, "fr", { hc: "main plate" }, null);
    const failure = await failureOf(save(teacher, "fr", { hc: "autre" }, null));
    expect(failure.code).toBe("CONFLICT");
    expect(failure.data).toMatchObject({ current: { version: 1 } });
  });

  it("lets only one of two saves from the same version win", async () => {
    await save(teacher, "nl", NL, null);
    const outcomes = await Promise.allSettled([
      save(teacher, "nl", { ...NL, hc: "A" }, 1),
      save(admin, "nl", { ...NL, hc: "B" }, 1),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    });
    expect((await info()).rows.nl?.version).toBe(2);
  });

  it("writes nothing and makes no entry when the texts are what is stored", async () => {
    await save(teacher, "nl", NL, null);
    const mark = await auditMark();
    expect(await save(teacher, "nl", NL, 1)).toEqual({ version: 1 });
    expect(await save(teacher, "en", {}, null)).toEqual({ version: null });
    expect(await auditRowsSince(mark)).toEqual([]);
    expect((await info()).rows.en).toBeUndefined();
  });

  it("clearing a field is a change", async () => {
    await save(teacher, "nl", NL, null);
    expect(await save(teacher, "nl", { ...NL, note: "" }, 1)).toEqual({
      version: 2,
    });
    expect((await info()).rows.nl?.note).toBe("");
  });

  it("lets a teacher and an admin write any enabled language, the default included", async () => {
    expect(await save(teacher, "nl", NL, null)).toEqual({ version: 1 });
    expect(await save(admin, "fr", { hc: "x" }, null)).toEqual({ version: 1 });
    expect(await save(both, "en", { hc: "y" }, null)).toEqual({ version: 1 });
  });

  it("lets a translator write a non-default language only", async () => {
    expect(await save(translator, "fr", { hc: "main plate" }, null)).toEqual({
      version: 1,
    });
    const mark = await auditMark();
    const refused = await failureOf(save(translator, "nl", NL, null));
    expect(refused.code).toBe("FORBIDDEN");
    expect(await auditRowsSince(mark)).toEqual([]);
    expect((await info()).rows.nl).toBeUndefined();
  });

  it("a translator who is also a teacher writes the default language", async () => {
    expect(await save(both, "nl", NL, null)).toEqual({ version: 1 });
  });

  it("refuses a guest and a learner", async () => {
    expect((await failureOf(save(null, "fr", NL, null))).code).toBe(
      "UNAUTHORIZED"
    );
    expect((await failureOf(save(learner, "fr", NL, null))).code).toBe(
      "FORBIDDEN"
    );
    expect(Object.keys((await info()).rows)).toEqual([]);
  });

  it("refuses a language that is not enabled (VALIDATION) and an unknown gesture (NOT_FOUND)", async () => {
    await env.DB.prepare(
      "UPDATE language SET enabled = 0 WHERE code = 'fr'"
    ).run();
    const failure = await failureOf(save(teacher, "fr", NL, null));
    expect(failure.code).toBe("VALIDATION");
    expect(failure.data).toMatchObject({
      fieldErrors: { locale: ["notEnabled"] },
    });
    expect((await failureOf(save(teacher, "de", NL, null))).code).toBe(
      "VALIDATION"
    );
    expect(
      (await failureOf(save(teacher, "nl", NL, null, "no-such-gesture"))).code
    ).toBe("NOT_FOUND");
  });

  it("caps every field at 2,000 characters", async () => {
    const ok = await save(teacher, "nl", { hc: "x".repeat(2000) }, null);
    expect(ok).toEqual({ version: 1 });
    const failures = await Promise.all(
      ["hc", "pl", "or", "bw", "cNote", "note", "summary"].map((field) =>
        failureOf(save(teacher, "en", { [field]: "x".repeat(2001) }, null))
      )
    );
    for (const failure of failures) {
      expect(["BAD_REQUEST", "VALIDATION"]).toContain(failure.code);
    }
  });
});

describe("teacherInfoCoverage", () => {
  it("says own, fallback or none per gesture, once each, in the order asked", async () => {
    const other = await addGesture("Dag");
    const third = await addGesture("Bye");
    await save(teacher, "nl", NL, null);
    await save(teacher, "fr", { hc: "main" }, null);
    await save(teacher, "nl", { hc: "vlak" }, null, other);
    // A saved clearing is not information.
    await save(teacher, "nl", { hc: "x" }, null, third);
    await save(teacher, "nl", {}, 1, third);

    const fr = await teacherInfoCoverage(
      testDb(),
      [gestureId, other, third, gestureId],
      "fr"
    );
    expect(fr.items).toEqual([
      { gestureId, state: "own" },
      { gestureId: other, state: "fallback" },
      { gestureId: third, state: "none" },
    ]);
    expect([fr.own, fr.fallback, fr.none]).toEqual([1, 1, 1]);

    const nl = await teacherInfoCoverage(testDb(), [gestureId, other], "nl");
    expect(nl.items.map((item) => item.state)).toEqual(["own", "own"]);
    const en = await teacherInfoCoverage(testDb(), [gestureId, other], "en");
    expect(en.items.map((item) => item.state)).toEqual([
      "fallback",
      "fallback",
    ]);
  });

  it("handles an empty list and more gestures than one query binds", async () => {
    expect((await teacherInfoCoverage(testDb(), [], "fr")).items).toEqual([]);
    const ids = Array.from({ length: 130 }, (_, index) => `missing-${index}`);
    const result = await teacherInfoCoverage(testDb(), ids, "fr");
    expect(result.none).toBe(130);
  });
});
