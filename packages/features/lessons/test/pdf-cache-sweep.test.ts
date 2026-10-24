// biome-ignore-all lint/performance/noAwaitInLoops: objects are written and checked one at a time.
import { env } from "cloudflare:workers";
import { DAY_MS } from "@smog/utils";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LESSON_PDF_MAX_AGE_MS,
  sweepStalePdfs,
} from "../src/server/pdf-cache-sweep";

const KEEP = "teacher/drawings/g/1/u";

async function put(key: string): Promise<void> {
  await env.MEDIA.put(key, new Uint8Array([1, 2, 3]));
}

async function exists(key: string): Promise<boolean> {
  return (await env.MEDIA.head(key)) !== null;
}

beforeEach(async () => {
  const listed = await env.MEDIA.list({ prefix: "teacher/" });
  await Promise.all(
    listed.objects.map((object) => env.MEDIA.delete(object.key))
  );
});

describe("sweepStalePdfs", () => {
  it("deletes cached PDFs older than 30 days and keeps younger ones", async () => {
    const keys = [
      "teacher/pdf/l1/a-teachers-nl.pdf",
      "teacher/pdf/l2/b-participants-fr.pdf",
    ];
    for (const key of keys) {
      await put(key);
    }
    const now = Date.now();
    expect(LESSON_PDF_MAX_AGE_MS).toBe(30 * DAY_MS);
    expect(await sweepStalePdfs(env.MEDIA, new Date(now + 29 * DAY_MS))).toBe(
      0
    );
    expect(await Promise.all(keys.map(exists))).toEqual([true, true]);
    expect(await sweepStalePdfs(env.MEDIA, new Date(now + 31 * DAY_MS))).toBe(
      2
    );
    expect(await Promise.all(keys.map(exists))).toEqual([false, false]);
  });

  it("counts without deleting in a dry run and touches nothing outside its prefix", async () => {
    await put("teacher/pdf/l1/a-teachers-nl.pdf");
    await put(KEEP);
    await put("audio/g/nl/u");
    const later = new Date(Date.now() + 40 * DAY_MS);
    expect(await sweepStalePdfs(env.MEDIA, later, { dryRun: true })).toBe(1);
    expect(await exists("teacher/pdf/l1/a-teachers-nl.pdf")).toBe(true);
    expect(await sweepStalePdfs(env.MEDIA, later)).toBe(1);
    expect(await exists("teacher/pdf/l1/a-teachers-nl.pdf")).toBe(false);
    expect(await exists(KEEP)).toBe(true);
    expect(await exists("audio/g/nl/u")).toBe(true);
  });

  it("walks several listing pages", async () => {
    for (let at = 0; at < 5; at += 1) {
      await put(`teacher/pdf/l${at}/a-teachers-nl.pdf`);
    }
    const later = new Date(Date.now() + 31 * DAY_MS);
    expect(await sweepStalePdfs(env.MEDIA, later, { pageSize: 2 })).toBe(5);
    expect((await env.MEDIA.list({ prefix: "teacher/pdf/" })).objects).toEqual(
      []
    );
  });

  it("stops after the page cap and finishes the next run", async () => {
    for (let at = 0; at < 5; at += 1) {
      await put(`teacher/pdf/l${at}/a-teachers-nl.pdf`);
    }
    const later = new Date(Date.now() + 31 * DAY_MS);
    expect(
      await sweepStalePdfs(env.MEDIA, later, { maxPages: 1, pageSize: 2 })
    ).toBe(2);
    expect(
      await sweepStalePdfs(env.MEDIA, later, { maxPages: 5, pageSize: 2 })
    ).toBe(3);
  });
});
