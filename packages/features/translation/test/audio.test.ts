import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUDIO_KEY_PATTERN,
  type AudioRow,
  type AudioUploadResult,
} from "../src/schema";
import { signAudioUpload, verifyAudioUpload } from "../src/server/audio-upload";
import { m4aBytes, mp3Bytes } from "../src/testing";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  resetTranslationData,
  signedUp,
  TEST_SECRET,
} from "./helpers";

const GESTURE_ID = "5b0a6bd4-4a1c-4c6f-a8d6-1f9d6a8d0a01";
let admin: Authed;
let translator: Authed;
let learner: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
  translator = await signedUp("translator");
  learner = await signedUp("user");
});

beforeEach(async () => {
  await resetTranslationData();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM gesture_audio"),
    env.DB.prepare("DELETE FROM gesture WHERE id = ?").bind(GESTURE_ID),
    env.DB.prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'hallo', 'Hallo', 'hallo', 'pb', 1, 1)"
    ).bind(GESTURE_ID),
  ]);
});

/** What the dev same-origin route stores: the object under the issued key, with a declared type. */
async function put(
  upload: AudioUploadResult,
  bytes: Uint8Array,
  contentType = upload.headers["content-type"]
): Promise<void> {
  await env.MEDIA.put(upload.key, bytes, { httpMetadata: { contentType } });
}

async function issue(
  as: Authed,
  input: Partial<{
    contentType: string;
    gestureId: string;
    locale: string;
    size: number;
  }> = {}
): Promise<AudioUploadResult> {
  return await callAs<AudioUploadResult>(as, "uploadAudio", {
    contentType: "audio/mpeg",
    gestureId: GESTURE_ID,
    locale: "fr",
    size: 5000,
    ...input,
  });
}

function finalize(as: Authed, upload: AudioUploadResult, locale = "fr") {
  return callAs<AudioRow>(as, "finalizeAudio", {
    gestureId: GESTURE_ID,
    key: upload.key,
    locale,
  });
}

async function objectExists(key: string): Promise<boolean> {
  return (await env.MEDIA.head(key)) !== null;
}

describe("who may use the audio procedures", () => {
  it("refuses a learner and a guest, admits a translator and an admin", async () => {
    expect((await failureOf(issue(learner))).code).toBe("FORBIDDEN");
    expect(
      (await failureOf(callAs(null, "listAudio", { gestureId: GESTURE_ID })))
        .code
    ).toBe("UNAUTHORIZED");
    expect((await issue(translator)).key).toMatch(AUDIO_KEY_PATTERN);
    expect((await issue(admin)).key).toMatch(AUDIO_KEY_PATTERN);
  });
});

describe("uploadAudio", () => {
  it("issues a signed same-origin PUT without R2 tokens, for the gesture and the language", async () => {
    const upload = await issue(translator);
    expect(upload.key).toMatch(
      new RegExp(`^audio/${GESTURE_ID}/fr/[0-9a-f-]{36}$`)
    );
    expect(upload.headers).toEqual({ "content-type": "audio/mpeg" });
    const url = new URL(upload.uploadUrl);
    expect(url.pathname).toBe(
      `/api/audio/upload/${upload.key.slice("audio/".length)}`
    );
    const sig = url.searchParams.get("sig") ?? "";
    const exp = Number(url.searchParams.get("exp"));
    expect(exp).toBe(upload.expiresAt);
    expect(
      await verifyAudioUpload(TEST_SECRET, {
        contentType: "audio/mpeg",
        expiresAt: exp,
        key: upload.key,
        now: Date.now(),
        signature: sig,
      })
    ).toBe("ok");
  });

  it("refuses an unknown gesture, a language that is not enabled and a bad type or size", async () => {
    expect(
      (await failureOf(issue(translator, { gestureId: crypto.randomUUID() })))
        .code
    ).toBe("NOT_FOUND");
    expect((await failureOf(issue(translator, { locale: "de" }))).code).toBe(
      "NOT_FOUND"
    );
    expect(
      (await failureOf(issue(translator, { contentType: "audio/wav" }))).code
    ).toBe("BAD_REQUEST");
    expect((await failureOf(issue(translator, { size: 2_000_000 }))).code).toBe(
      "BAD_REQUEST"
    );
  });

  it("signs the type: a signature does not carry over to another type, key or time", async () => {
    const signature = await signAudioUpload("secret-secret-secret", {
      contentType: "audio/mpeg",
      expiresAt: 10,
      key: "audio/a/b/c",
    });
    const base = {
      contentType: "audio/mpeg",
      expiresAt: 10,
      key: "audio/a/b/c",
      now: 5,
      signature,
    };
    expect(await verifyAudioUpload("secret-secret-secret", base)).toBe("ok");
    expect(
      await verifyAudioUpload("secret-secret-secret", { ...base, now: 11 })
    ).toBe("expired");
    expect(
      await verifyAudioUpload("secret-secret-secret", {
        ...base,
        contentType: "audio/mp4",
      })
    ).toBe("invalid");
    expect(
      await verifyAudioUpload("secret-secret-secret", {
        ...base,
        key: "audio/a/b/d",
      })
    ).toBe("invalid");
    expect(await verifyAudioUpload("another-secret-here!!", base)).toBe(
      "invalid"
    );
  });
});

describe("finalizeAudio", () => {
  it("records a valid MP3 under a fresh key, audited, and removes the upload", async () => {
    const upload = await issue(translator);
    await put(upload, mp3Bytes(2));
    const mark = await auditMark();
    const row = await finalize(translator, upload);
    expect(row).toMatchObject({
      contentType: "audio/mpeg",
      gestureId: GESTURE_ID,
      locale: "fr",
    });
    expect(row.durationMs).toBeGreaterThan(1900);
    expect(row.path).toMatch(new RegExp(`^/api/audio/${GESTURE_ID}/fr/`));
    expect(await objectExists(upload.key)).toBe(false);
    const storedKey = `audio/${row.path.slice("/api/audio/".length)}`;
    expect(storedKey).not.toBe(upload.key);
    expect(await objectExists(storedKey)).toBe(true);
    const audit = await auditRowsSince(mark);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "translation.audio_upload",
      actorId: translator.user.id,
      targetId: GESTURE_ID,
      targetType: "gesture",
    });
    expect(audit[0]?.data).toMatchObject({ locale: "fr", replaced: false });
    expect(JSON.stringify(audit[0]?.data)).not.toContain("audio/");
  });

  it("accepts an M4A", async () => {
    const upload = await issue(admin, { contentType: "audio/mp4" });
    await put(upload, m4aBytes(3));
    expect((await finalize(admin, upload)).contentType).toBe("audio/mp4");
  });

  it("replaces the clip of a language and deletes the previous object", async () => {
    const first = await issue(translator);
    await put(first, mp3Bytes(1));
    const one = await finalize(translator, first);
    const second = await issue(translator);
    await put(second, mp3Bytes(2));
    const mark = await auditMark();
    const two = await finalize(translator, second);
    expect(two.path).not.toBe(one.path);
    expect(
      await objectExists(`audio/${one.path.slice("/api/audio/".length)}`)
    ).toBe(false);
    const list = await callAs<{ items: AudioRow[] }>(translator, "listAudio", {
      gestureId: GESTURE_ID,
    });
    expect(list.items.map((item) => item.path)).toEqual([two.path]);
    expect((await auditRowsSince(mark))[0]?.data).toMatchObject({
      replaced: true,
    });
  });

  it("refuses wrong magic bytes (a PNG named audio/mpeg) and deletes the upload", async () => {
    const upload = await issue(translator);
    await put(
      upload,
      Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
      ])
    );
    const mark = await auditMark();
    const failure = await failureOf(finalize(translator, upload));
    expect(failure.code).toBe("VALIDATION");
    expect(JSON.stringify(failure.data)).toContain("format");
    expect(await objectExists(upload.key)).toBe(false);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(
      (
        await callAs<{ items: AudioRow[] }>(translator, "listAudio", {
          gestureId: GESTURE_ID,
        })
      ).items
    ).toEqual([]);
  });

  it("refuses an M4A declared as MP3 (the declared type is not trusted)", async () => {
    const upload = await issue(translator);
    await put(upload, m4aBytes(2));
    const failure = await failureOf(finalize(translator, upload));
    expect(JSON.stringify(failure.data)).toContain("format");
    expect(await objectExists(upload.key)).toBe(false);
  });

  it("refuses a clip over ten seconds", async () => {
    const upload = await issue(translator);
    await put(upload, mp3Bytes(12));
    const failure = await failureOf(finalize(translator, upload));
    expect(failure.code).toBe("VALIDATION");
    expect(JSON.stringify(failure.data)).toContain("duration");
    expect(await objectExists(upload.key)).toBe(false);
  });

  it("refuses an object over 1 MiB", async () => {
    const upload = await issue(translator);
    await put(upload, new Uint8Array(1_048_577));
    const failure = await failureOf(finalize(translator, upload));
    expect(JSON.stringify(failure.data)).toContain("tooLarge");
    expect(await objectExists(upload.key)).toBe(false);
  });

  it("refuses a key that was never uploaded, another gesture's key, and a stored key", async () => {
    const never = await issue(translator);
    expect(
      JSON.stringify((await failureOf(finalize(translator, never))).data)
    ).toContain("missing");
    const other = await issue(translator);
    await put(other, mp3Bytes(1));
    const wrongLocale = await failureOf(finalize(translator, other, "en"));
    expect(JSON.stringify(wrongLocale.data)).toContain("key");
    expect(await objectExists(other.key)).toBe(true);
    const stored = await finalize(translator, other);
    const storedKey = `audio/${stored.path.slice("/api/audio/".length)}`;
    const again = await failureOf(
      callAs(translator, "finalizeAudio", {
        gestureId: GESTURE_ID,
        key: storedKey,
        locale: "fr",
      })
    );
    expect(JSON.stringify(again.data)).toContain("key");
    expect(await objectExists(storedKey)).toBe(true);
  });

  it("refuses a learner", async () => {
    const upload = await issue(translator);
    await put(upload, mp3Bytes(1));
    expect((await failureOf(finalize(learner, upload))).code).toBe("FORBIDDEN");
  });
});

describe("deleteAudio", () => {
  it("removes the row and the object, audited; a second delete changes nothing", async () => {
    const upload = await issue(translator);
    await put(upload, mp3Bytes(1));
    const row = await finalize(translator, upload);
    const key = `audio/${row.path.slice("/api/audio/".length)}`;
    const mark = await auditMark();
    expect(
      await callAs(translator, "deleteAudio", {
        gestureId: GESTURE_ID,
        locale: "fr",
      })
    ).toEqual({ deleted: true });
    expect(await objectExists(key)).toBe(false);
    const audit = await auditRowsSince(mark);
    expect(audit.map((entry) => entry.action)).toEqual([
      "translation.audio_delete",
    ]);
    expect(
      await callAs(translator, "deleteAudio", {
        gestureId: GESTURE_ID,
        locale: "fr",
      })
    ).toEqual({ deleted: false });
    expect(await auditRowsSince(mark)).toHaveLength(1);
  });
});
