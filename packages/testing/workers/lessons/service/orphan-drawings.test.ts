// biome-ignore-all lint/performance/noAwaitInLoops: the fixtures are written and checked one object at a time.
import { env } from "cloudflare:workers";
import { createDb } from "@smog/db/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DRAWING_CURSOR_KEY,
  ORPHAN_DRAWING_MIN_AGE_MS,
  sweepOrphanDrawings,
} from "../../../../features/lessons/src/server/orphan-drawings";
import { pngBytes } from "../../../support/lessons/fixtures";

const GESTURE_ID = "5b0a6bd4-4a1c-4c6f-a8d6-1f9d6a8d0c01";
const DAY = 24 * 60 * 60 * 1000;

function key(step: 1 | 2): string {
  return `teacher/drawings/${GESTURE_ID}/${step}/${crypto.randomUUID()}`;
}

async function put(name: string): Promise<void> {
  await env.MEDIA.put(name, pngBytes(), {
    httpMetadata: { contentType: "image/png" },
  });
}

async function exists(name: string): Promise<boolean> {
  return (await env.MEDIA.head(name)) !== null;
}

async function clearBucket(): Promise<void> {
  const listed = await env.MEDIA.list({ prefix: "teacher/" });
  if (listed.objects.length > 0) {
    await env.MEDIA.delete(listed.objects.map((object) => object.key));
  }
}

beforeEach(async () => {
  await clearBucket();
  await env.KV.delete(DRAWING_CURSOR_KEY);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM gesture_drawing"),
    env.DB.prepare("DELETE FROM gesture WHERE id = ?").bind(GESTURE_ID),
    env.DB.prepare(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES (?, 'sweep-d', 'Sweep', 'sweep', 'pb', 1, 1)"
    ).bind(GESTURE_ID),
  ]);
});

async function reference(name: string, step: 1 | 2): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO gesture_drawing (gesture_id, step, r2_key, content_type, size, width, height, credit, updated_at) VALUES (?, ?, ?, 'image/png', 100, 8, 8, '', 1)"
  )
    .bind(GESTURE_ID, step, name)
    .run();
}

/** A day and an hour from now: everything uploaded in the test is older than the grace. */
const LATER = () =>
  new Date(Date.now() + ORPHAN_DRAWING_MIN_AGE_MS + 3_600_000);

describe("sweepOrphanDrawings", () => {
  it("deletes unreferenced old objects and keeps the referenced ones", async () => {
    const kept = key(1);
    const orphan = key(2);
    await put(kept);
    await put(orphan);
    await reference(kept, 1);
    const deleted = await sweepOrphanDrawings(
      createDb(env.DB),
      env.MEDIA,
      LATER()
    );
    expect(deleted).toBe(1);
    expect(await exists(kept)).toBe(true);
    expect(await exists(orphan)).toBe(false);
  });

  it("keeps a fresh upload that waits for its finalize", async () => {
    const fresh = key(1);
    await put(fresh);
    const deleted = await sweepOrphanDrawings(
      createDb(env.DB),
      env.MEDIA,
      new Date(Date.now() + DAY / 2)
    );
    expect(deleted).toBe(0);
    expect(await exists(fresh)).toBe(true);
  });

  it("touches nothing outside teacher/drawings/ (audio, logos and the PDF cache)", async () => {
    const others = [
      "audio/x/nl/y",
      "logos/abc",
      `teacher/pdf/${GESTURE_ID}/abc-teachers-nl.pdf`,
    ];
    for (const other of others) {
      await put(other);
    }
    await sweepOrphanDrawings(createDb(env.DB), env.MEDIA, LATER());
    for (const other of others) {
      expect(await exists(other), other).toBe(true);
      await env.MEDIA.delete(other);
    }
  });

  it("a dry run counts and changes nothing, the cursor included", async () => {
    await put(key(1));
    await put(key(2));
    const deleted = await sweepOrphanDrawings(
      createDb(env.DB),
      env.MEDIA,
      LATER(),
      { dryRun: true, kv: env.KV, pageSize: 1 }
    );
    expect(deleted).toBe(2);
    expect(
      (await env.MEDIA.list({ prefix: "teacher/drawings/" })).objects
    ).toHaveLength(2);
    expect(await env.KV.get(DRAWING_CURSOR_KEY)).toBeNull();
  });

  it("resumes from the KV cursor across runs and clears it when the listing ends", async () => {
    for (let index = 0; index < 5; index += 1) {
      await put(key(1));
    }
    const db = createDb(env.DB);
    const options = { kv: env.KV, maxPages: 2, pageSize: 2 };
    expect(await sweepOrphanDrawings(db, env.MEDIA, LATER(), options)).toBe(4);
    // Two pages of two were reached; the cursor waits for the rest.
    expect(await env.KV.get(DRAWING_CURSOR_KEY)).not.toBeNull();
    expect(await sweepOrphanDrawings(db, env.MEDIA, LATER(), options)).toBe(1);
    expect(await env.KV.get(DRAWING_CURSOR_KEY)).toBeNull();
    expect(
      (await env.MEDIA.list({ prefix: "teacher/drawings/" })).objects
    ).toHaveLength(0);
  });

  it("handles a page of more keys than one D1 statement can bind", async () => {
    const referencedKeys: string[] = [];
    for (let index = 0; index < 120; index += 1) {
      referencedKeys.push(key(1));
    }
    await Promise.all(referencedKeys.map(put));
    // Reference one in the last chunk of the page.
    await reference(referencedKeys[119] ?? "", 1);
    const deleted = await sweepOrphanDrawings(
      createDb(env.DB),
      env.MEDIA,
      LATER()
    );
    expect(deleted).toBe(119);
    expect(await exists(referencedKeys[119] ?? "")).toBe(true);
  });
});
