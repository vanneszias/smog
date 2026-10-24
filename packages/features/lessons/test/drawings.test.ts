// biome-ignore-all lint/performance/noAwaitInLoops: the fixtures are written and checked one object at a time.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DRAWING_KEY_PATTERN,
  type DrawingRow,
  type DrawingUploadResult,
} from "../src/schema";
import {
  signDrawingUpload,
  verifyDrawingUpload,
} from "../src/server/drawing-upload";
import { jpegBytes, pngBombBytes, pngBytes, webpBytes } from "../src/testing";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  signedUp,
  TEST_SECRET,
} from "./helpers";

const DRAWING_KEY_SHAPE =
  /teacher\/drawings\/[0-9a-f-]{36}\/[12]\/[0-9a-f-]{36}/;
const GESTURE_ID = "5b0a6bd4-4a1c-4c6f-a8d6-1f9d6a8d0b01";
const OTHER_GESTURE_ID = "5b0a6bd4-4a1c-4c6f-a8d6-1f9d6a8d0b02";
let admin: Authed;
let teacher: Authed;
let translator: Authed;
let learner: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
  teacher = await signedUp("teacher");
  translator = await signedUp("translator");
  learner = await signedUp();
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM gesture_drawing"),
    env.DB.prepare("DELETE FROM gesture WHERE id IN (?, ?)").bind(
      GESTURE_ID,
      OTHER_GESTURE_ID
    ),
    env.DB.prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'hallo-d', 'Hallo', 'hallo', 'pb', 1, 1)"
    ).bind(GESTURE_ID),
    env.DB.prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'dag-d', 'Dag', 'dag', 'pb', 1, 1)"
    ).bind(OTHER_GESTURE_ID),
  ]);
});

/** What the dev same-origin route stores: the object under the issued key, with a declared type. */
async function put(
  upload: DrawingUploadResult,
  bytes: Uint8Array,
  contentType: string = upload.headers["content-type"]
): Promise<void> {
  await env.MEDIA.put(upload.key, bytes, { httpMetadata: { contentType } });
}

async function issue(
  as: Authed,
  input: Partial<{
    contentType: string;
    gestureId: string;
    size: number;
    step: number;
  }> = {}
): Promise<DrawingUploadResult> {
  return await callAs<DrawingUploadResult>(as, "uploadDrawing", {
    contentType: "image/png",
    gestureId: GESTURE_ID,
    size: 5000,
    step: 1,
    ...input,
  });
}

function finalize(
  as: Authed,
  upload: DrawingUploadResult,
  input: Partial<{ credit: string; gestureId: string; step: number }> = {}
) {
  return callAs<DrawingRow>(as, "finalizeDrawing", {
    credit: "© Invented Studio",
    gestureId: GESTURE_ID,
    key: upload.key,
    step: 1,
    ...input,
  });
}

async function objectExists(key: string): Promise<boolean> {
  return (await env.MEDIA.head(key)) !== null;
}

/** Issues, stores and finalizes one drawing as the teacher. */
async function stored(
  bytes: Uint8Array,
  contentType: string,
  step: 1 | 2 = 1,
  credit = "© Invented Studio"
): Promise<DrawingRow> {
  const upload = await issue(teacher, { contentType, step });
  await put(upload, bytes);
  return await finalize(teacher, upload, { credit, step });
}

describe("who may use the drawing procedures", () => {
  it("refuses a learner and a guest everywhere", async () => {
    expect((await failureOf(issue(learner))).code).toBe("FORBIDDEN");
    expect(
      (await failureOf(callAs(null, "listDrawings", { gestureId: GESTURE_ID })))
        .code
    ).toBe("UNAUTHORIZED");
    expect(
      (
        await failureOf(
          callAs(learner, "listDrawings", { gestureId: GESTURE_ID })
        )
      ).code
    ).toBe("FORBIDDEN");
    expect(
      (
        await failureOf(
          callAs(null, "deleteDrawing", { gestureId: GESTURE_ID, step: 1 })
        )
      ).code
    ).toBe("UNAUTHORIZED");
  });

  it("admits a teacher and an admin to write, a translator only to read", async () => {
    expect((await issue(teacher)).key).toMatch(DRAWING_KEY_PATTERN);
    expect((await issue(admin)).key).toMatch(DRAWING_KEY_PATTERN);
    expect((await failureOf(issue(translator))).code).toBe("FORBIDDEN");
    expect(
      (
        await failureOf(
          callAs(translator, "deleteDrawing", {
            gestureId: GESTURE_ID,
            step: 1,
          })
        )
      ).code
    ).toBe("FORBIDDEN");
    const upload = await issue(teacher);
    await put(upload, pngBytes());
    expect((await failureOf(finalize(translator, upload))).code).toBe(
      "FORBIDDEN"
    );
    // The refused finalize did not touch the upload.
    expect(await objectExists(upload.key)).toBe(true);
    expect(
      await callAs(translator, "listDrawings", { gestureId: GESTURE_ID })
    ).toEqual({ items: [] });
  });
});

describe("uploadDrawing", () => {
  it("issues a signed same-origin PUT without R2 tokens, for the gesture and the step", async () => {
    const upload = await issue(teacher, { step: 2 });
    expect(upload.key).toMatch(
      new RegExp(`^teacher/drawings/${GESTURE_ID}/2/[0-9a-f-]{36}$`)
    );
    expect(upload.headers).toEqual({ "content-type": "image/png" });
    const url = new URL(upload.uploadUrl);
    expect(url.pathname).toBe(
      `/api/teacher/drawings/upload/${upload.key.slice("teacher/drawings/".length)}`
    );
    const exp = Number(url.searchParams.get("exp"));
    expect(exp).toBe(upload.expiresAt);
    expect(
      await verifyDrawingUpload(TEST_SECRET, {
        contentType: "image/png",
        expiresAt: exp,
        key: upload.key,
        now: Date.now(),
        signature: url.searchParams.get("sig") ?? "",
      })
    ).toBe("ok");
  });

  it("refuses an unknown gesture, a bad step, type or size", async () => {
    expect(
      (await failureOf(issue(teacher, { gestureId: crypto.randomUUID() }))).code
    ).toBe("NOT_FOUND");
    expect((await failureOf(issue(teacher, { step: 3 }))).code).toBe(
      "BAD_REQUEST"
    );
    expect(
      (await failureOf(issue(teacher, { contentType: "image/gif" }))).code
    ).toBe("BAD_REQUEST");
    expect(
      (await failureOf(issue(teacher, { contentType: "image/svg+xml" }))).code
    ).toBe("BAD_REQUEST");
    // A WebP cannot be embedded in the PDF: no longer a type an upload may declare.
    expect(
      (await failureOf(issue(teacher, { contentType: "image/webp" }))).code
    ).toBe("BAD_REQUEST");
    expect((await failureOf(issue(teacher, { size: 524_289 }))).code).toBe(
      "BAD_REQUEST"
    );
    expect((await failureOf(issue(teacher, { size: 0 }))).code).toBe(
      "BAD_REQUEST"
    );
  });

  it("signs the type, the key and the time, with its own key (an audio signature is no drawing signature)", async () => {
    const claim = {
      contentType: "image/png",
      expiresAt: 10,
      key: "teacher/drawings/a/1/c",
    };
    const signature = await signDrawingUpload("secret-secret-secret", claim);
    const check = (
      override: Partial<typeof claim & { now: number; secret: string }>
    ) =>
      verifyDrawingUpload(override.secret ?? "secret-secret-secret", {
        ...claim,
        now: 5,
        signature,
        ...override,
      });
    expect(await check({})).toBe("ok");
    expect(await check({ now: 11 })).toBe("expired");
    expect(await check({ contentType: "image/webp" })).toBe("invalid");
    expect(await check({ key: "teacher/drawings/a/1/d" })).toBe("invalid");
    expect(await check({ secret: "another-secret-another" })).toBe("invalid");
    expect(await check({ expiresAt: 11 })).toBe("invalid");
  });
});

describe("finalizeDrawing", () => {
  it("stores a PNG and a JPEG under fresh keys, with size, dimensions, credit and an audit entry", async () => {
    const mark = await auditMark();
    const png = await stored(pngBytes(120, 80), "image/png", 1);
    const jpeg = await stored(
      jpegBytes(300, 200),
      "image/jpeg",
      2,
      "  Credit "
    );
    expect(png).toMatchObject({
      contentType: "image/png",
      credit: "© Invented Studio",
      gestureId: GESTURE_ID,
      height: 80,
      step: 1,
      width: 120,
    });
    expect(jpeg).toMatchObject({
      contentType: "image/jpeg",
      // The input schema trims the credit.
      credit: "Credit",
      height: 200,
      step: 2,
      width: 300,
    });
    expect(png.path).toBe(
      `/api/teacher/drawings/${GESTURE_ID}/1?v=${png.updatedAt}`
    );
    const { results } = await env.DB.prepare(
      "SELECT step, r2_key AS key, size FROM gesture_drawing WHERE gesture_id = ? ORDER BY step"
    )
      .bind(GESTURE_ID)
      .all<{ key: string; size: number; step: number }>();
    expect(results.map((row) => row.step)).toEqual([1, 2]);
    for (const row of results) {
      expect(row.key).toMatch(DRAWING_KEY_PATTERN);
      const object = await env.MEDIA.get(row.key);
      expect(object?.size).toBe(row.size);
    }
    const audits = await auditRowsSince(mark);
    expect(audits.map((row) => [row.action, row.targetId, row.data])).toEqual([
      ["teacher.drawing_upload", `${GESTURE_ID}:1`, { step: 1 }],
      ["teacher.drawing_upload", `${GESTURE_ID}:2`, { step: 2 }],
    ]);
    // The entry names ids and the step, never the credit or any bytes.
    expect(JSON.stringify(audits)).not.toContain("Invented");
  });

  it("copies to a fresh key and removes the upload, so a still-valid PUT URL cannot change what was checked", async () => {
    const upload = await issue(teacher);
    await put(upload, pngBytes());
    const row = await finalize(teacher, upload);
    expect(await objectExists(upload.key)).toBe(false);
    const { results } = await env.DB.prepare(
      "SELECT r2_key AS key FROM gesture_drawing WHERE gesture_id = ?"
    )
      .bind(GESTURE_ID)
      .all<{ key: string }>();
    expect(results).toHaveLength(1);
    expect(results[0]?.key).not.toBe(upload.key);
    expect(row.step).toBe(1);
  });

  it("replaces an earlier drawing of the step: one row, the old object removed, `replaced` audited", async () => {
    await stored(pngBytes(), "image/png", 1);
    const before = await env.DB.prepare(
      "SELECT r2_key AS key FROM gesture_drawing WHERE gesture_id = ? AND step = 1"
    )
      .bind(GESTURE_ID)
      .first<{ key: string }>();
    const mark = await auditMark();
    await stored(jpegBytes(40, 40), "image/jpeg", 1, "New credit");
    const { results } = await env.DB.prepare(
      "SELECT r2_key AS key, content_type AS type, credit FROM gesture_drawing WHERE gesture_id = ?"
    )
      .bind(GESTURE_ID)
      .all<{ credit: string; key: string; type: string }>();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      credit: "New credit",
      type: "image/jpeg",
    });
    expect(await objectExists(before?.key ?? "missing")).toBe(false);
    expect(await objectExists(results[0]?.key ?? "missing")).toBe(true);
    expect((await auditRowsSince(mark)).map((row) => row.data)).toEqual([
      { replaced: true, step: 1 },
    ]);
  });

  it("refuses a forged type: the bytes decide, and the refused upload is deleted", async () => {
    const mark = await auditMark();
    // A WebP sent as a PNG.
    const wrongType = await issue(teacher);
    await put(wrongType, webpBytes(), "image/png");
    expect((await failureOf(finalize(teacher, wrongType))).data).toMatchObject({
      fieldErrors: { file: ["format"] },
    });
    expect(await objectExists(wrongType.key)).toBe(false);
    // Scripts, SVG and PDF content with an image type.
    for (const body of [
      "<html><script>alert(1)</script></html>",
      "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
      "%PDF-1.7 1 0 obj",
    ]) {
      const upload = await issue(teacher);
      await put(upload, new TextEncoder().encode(body));
      expect((await failureOf(finalize(teacher, upload))).data).toMatchObject({
        fieldErrors: { file: ["format"] },
      });
      expect(await objectExists(upload.key)).toBe(false);
    }
    // An image whose bytes are right but whose declared type is another one.
    const declared = await issue(teacher);
    await put(declared, pngBytes(), "text/html");
    expect((await failureOf(finalize(teacher, declared))).data).toMatchObject({
      fieldErrors: { file: ["format"] },
    });
    expect(await objectExists(declared.key)).toBe(false);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(
      await callAs(teacher, "listDrawings", { gestureId: GESTURE_ID })
    ).toEqual({ items: [] });
  });

  it("refuses a decompression bomb (a 1 x 1 PNG whose pixel stream inflates to 20 MB) and deletes it", async () => {
    const upload = await issue(teacher);
    await put(upload, await pngBombBytes());
    expect((await failureOf(finalize(teacher, upload))).data).toMatchObject({
      fieldErrors: { file: ["format"] },
    });
    expect(await objectExists(upload.key)).toBe(false);
  });

  it("refuses a file over 512 KiB and one over 1,200 px on a side", async () => {
    const big = await issue(teacher);
    await put(big, new Uint8Array(524_289).fill(1));
    expect((await failureOf(finalize(teacher, big))).data).toMatchObject({
      fieldErrors: { file: ["tooLarge"] },
    });
    expect(await objectExists(big.key)).toBe(false);
    for (const [bytes, type] of [
      [pngBytes(1201, 100), "image/png"],
      [jpegBytes(100, 2500), "image/jpeg"],
    ] as const) {
      const upload = await issue(teacher, { contentType: type });
      await put(upload, bytes);
      expect((await failureOf(finalize(teacher, upload))).data).toMatchObject({
        fieldErrors: { file: ["dimensions"] },
      });
      expect(await objectExists(upload.key)).toBe(false);
    }
  });

  it("refuses a missing object, a key of another gesture or step, a key already in use and an over-long credit", async () => {
    const upload = await issue(teacher);
    expect((await failureOf(finalize(teacher, upload))).data).toMatchObject({
      fieldErrors: { file: ["missing"] },
    });
    await put(upload, pngBytes());
    expect(
      (await failureOf(finalize(teacher, upload, { step: 2 }))).data
    ).toMatchObject({ fieldErrors: { file: ["key"] } });
    expect(
      (
        await failureOf(
          finalize(teacher, upload, { gestureId: OTHER_GESTURE_ID })
        )
      ).data
    ).toMatchObject({ fieldErrors: { file: ["key"] } });
    expect(
      (await failureOf(finalize(teacher, upload, { credit: "x".repeat(121) })))
        .code
    ).toBe("BAD_REQUEST");
    // A forged key shape.
    expect(
      (
        await failureOf(
          callAs(teacher, "finalizeDrawing", {
            credit: "",
            gestureId: GESTURE_ID,
            key: "teacher/drawings/../../audio/x",
            step: 1,
          })
        )
      ).code
    ).toBe("BAD_REQUEST");
    // The upload survived every refusal above and still finalizes.
    expect((await finalize(teacher, upload)).step).toBe(1);
    // Its own key is gone now; claiming a stored key is refused.
    const row = await env.DB.prepare(
      "SELECT r2_key AS key FROM gesture_drawing WHERE gesture_id = ?"
    )
      .bind(GESTURE_ID)
      .first<{ key: string }>();
    expect(
      (
        await failureOf(
          callAs(teacher, "finalizeDrawing", {
            credit: "",
            gestureId: GESTURE_ID,
            key: row?.key,
            step: 1,
          })
        )
      ).data
    ).toMatchObject({ fieldErrors: { file: ["key"] } });
  });

  it("answers NOT_FOUND for a gesture that does not exist", async () => {
    const missing = crypto.randomUUID();
    const key = `teacher/drawings/${missing}/1/${crypto.randomUUID()}`;
    await env.MEDIA.put(key, pngBytes(), {
      httpMetadata: { contentType: "image/png" },
    });
    expect(
      (
        await failureOf(
          callAs(teacher, "finalizeDrawing", {
            credit: "",
            gestureId: missing,
            key,
            step: 1,
          })
        )
      ).code
    ).toBe("NOT_FOUND");
  });
});

describe("deleteDrawing and listDrawings", () => {
  it("lists the steps in order, deletes one with its object and audits it", async () => {
    await stored(pngBytes(), "image/png", 2);
    await stored(pngBytes(), "image/png", 1);
    const list = await callAs<{ items: DrawingRow[] }>(
      translator,
      "listDrawings",
      { gestureId: GESTURE_ID }
    );
    expect(list.items.map((row) => row.step)).toEqual([1, 2]);
    // The list never carries an object key.
    expect(JSON.stringify(list)).not.toMatch(DRAWING_KEY_SHAPE);
    const key = (
      await env.DB.prepare(
        "SELECT r2_key AS key FROM gesture_drawing WHERE gesture_id = ? AND step = 2"
      )
        .bind(GESTURE_ID)
        .first<{ key: string }>()
    )?.key;
    const mark = await auditMark();
    expect(
      await callAs(teacher, "deleteDrawing", { gestureId: GESTURE_ID, step: 2 })
    ).toEqual({ deleted: true });
    expect(await objectExists(key ?? "missing")).toBe(false);
    expect(
      (
        await callAs<{ items: DrawingRow[] }>(admin, "listDrawings", {
          gestureId: GESTURE_ID,
        })
      ).items.map((row) => row.step)
    ).toEqual([1]);
    expect(
      (await auditRowsSince(mark)).map((row) => [
        row.action,
        row.targetId,
        row.data,
      ])
    ).toEqual([["teacher.drawing_delete", `${GESTURE_ID}:2`, { step: 2 }]]);
  });

  it("deleting a drawing that is not there changes and audits nothing", async () => {
    const mark = await auditMark();
    expect(
      await callAs(teacher, "deleteDrawing", { gestureId: GESTURE_ID, step: 1 })
    ).toEqual({ deleted: false });
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});
