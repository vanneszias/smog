/**
 * The drawing half of the daily retention purge (phase 10c task 3, plan
 * ruling 6). Drawings are private R2 objects under `teacher/drawings/`. A
 * replace removes the old object, a refused upload is deleted, but a crash
 * between two steps, an upload nobody finalized or a delete that failed
 * leaves an object no `gesture_drawing` row names. This sweep deletes every
 * `teacher/drawings/*` object that no row references and that was uploaded
 * more than 24 h ago (a fresh upload waits for its finalize; an upload URL
 * lives 5 minutes). The listing resumes from a KV cursor, so every object is
 * reached however many there are (20 pages a day), like the logo sweep.
 */
import { gestureDrawing, inList } from "@smog/db";
import type { Db } from "@smog/db/client";
import { DAY_MS } from "@smog/utils";

const DRAWING_PREFIX = "teacher/drawings/";
/** An unreferenced upload younger than this waits for its finalize. */
export const ORPHAN_DRAWING_MIN_AGE_MS = DAY_MS;
/** The KV key of the listing's cursor between runs. */
export const DRAWING_CURSOR_KEY = "retention:drawing-cursor";
/** Keys per R2 listing page (R2's maximum). */
const LIST_LIMIT = 1000;
/** Listing pages per run; the KV cursor continues the next day. */
const MAX_LIST_PAGES = 20;
/** D1 allows 100 bound parameters: keys per reference lookup. */
const LOOKUP_CHUNK = 90;

/** The part of the `MEDIA` R2 binding the sweep uses. */
export type DrawingBucket = Pick<R2Bucket, "delete" | "list">;
/** The part of the `KV` binding that keeps the listing cursor. */
export type DrawingCursorStore = Pick<KVNamespace, "delete" | "get" | "put">;

export interface OrphanDrawingOptions {
  /** Count what would be deleted, and change nothing (the cursor included). */
  dryRun?: boolean;
  /** Where the listing resumes; without it every run starts at the top. */
  kv?: DrawingCursorStore | undefined;
  /** Listing pages this run (default 20; tests use fewer). */
  maxPages?: number;
  /** Keys per listing page (default 1000, R2's maximum; tests use fewer). */
  pageSize?: number;
}

async function readCursor(
  kv: DrawingCursorStore | undefined
): Promise<string | undefined> {
  try {
    return (await kv?.get(DRAWING_CURSOR_KEY)) ?? undefined;
  } catch (error) {
    console.error("[lessons] Failed to read the drawing cursor:", error);
  }
}

async function saveCursor(
  kv: DrawingCursorStore | undefined,
  cursor: string | undefined
): Promise<void> {
  try {
    if (cursor) {
      await kv?.put(DRAWING_CURSOR_KEY, cursor);
    } else {
      await kv?.delete(DRAWING_CURSOR_KEY);
    }
  } catch (error) {
    console.error("[lessons] Failed to save the drawing cursor:", error);
  }
}

/** One listing page, from `cursor`; a cursor R2 no longer takes restarts at the top. */
async function listPage(
  media: DrawingBucket,
  cursor: string | undefined,
  limit: number
) {
  const options = { limit, prefix: DRAWING_PREFIX };
  if (!cursor) {
    return await media.list(options);
  }
  try {
    return await media.list({ ...options, cursor });
  } catch (error) {
    console.warn(
      "[lessons] The drawing cursor was refused; listing from the top:",
      error
    );
    return await media.list(options);
  }
}

/** The keys among `keys` that a drawing row names. */
async function referenced(db: Db, keys: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (let at = 0; at < keys.length; at += LOOKUP_CHUNK) {
    // biome-ignore lint/performance/noAwaitInLoops: bounded chunks of one listing page.
    const rows = await db
      .select({ key: gestureDrawing.r2Key })
      .from(gestureDrawing)
      .where(inList(gestureDrawing.r2Key, keys.slice(at, at + LOOKUP_CHUNK)));
    for (const row of rows) {
      used.add(row.key);
    }
  }
  return used;
}

/**
 * Deletes the unreferenced, old `teacher/drawings/*` objects; returns how
 * many (with `dryRun`, how many would be). One R2 delete per page; at most
 * 20 pages a run, the KV cursor continues the next day and is cleared when
 * the listing ends.
 */
export async function sweepOrphanDrawings(
  db: Db,
  media: DrawingBucket,
  now: Date,
  {
    dryRun = false,
    kv,
    maxPages = MAX_LIST_PAGES,
    pageSize = LIST_LIMIT,
  }: OrphanDrawingOptions = {}
): Promise<number> {
  const uploadedBefore = now.getTime() - ORPHAN_DRAWING_MIN_AGE_MS;
  let deleted = 0;
  let cursor = await readCursor(kv);
  for (let page = 0; page < maxPages; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: listing pages follow the cursor.
    const listed = await listPage(media, cursor, pageSize);
    const old = listed.objects
      .filter((object) => object.uploaded.getTime() < uploadedBefore)
      .map((object) => object.key);
    if (old.length > 0) {
      const used = await referenced(db, old);
      const orphans = old.filter((key) => !used.has(key));
      if (orphans.length > 0 && !dryRun) {
        await media.delete(orphans);
      }
      deleted += orphans.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
    if (!cursor) {
      break;
    }
  }
  if (!dryRun) {
    await saveCursor(kv, cursor);
  }
  return deleted;
}
