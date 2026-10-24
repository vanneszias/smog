/**
 * The PDF cache half of the daily retention (phase 10c task 5b, plan ruling
 * 3). A cached lesson PDF is never invalidated: an edit makes a new key and
 * the old file simply stops being asked for. This sweep deletes every
 * `teacher/pdf/*` object uploaded more than 30 days ago, so old versions do
 * not pile up. A teacher who exports an old state again just renders it
 * again. Nothing outside `teacher/pdf/` is touched.
 *
 * The listing starts at the top every day; deleted files leave it, so a
 * cache of up to `MAX_LIST_PAGES * 1000` files is cleaned in one run (a
 * teaching site has hundreds).
 */
import { DAY_MS } from "@smog/utils";
import { LESSON_PDF_PREFIX } from "./export-run";

/** A cached file older than this is deleted. */
export const LESSON_PDF_MAX_AGE_MS = 30 * DAY_MS;
const LIST_LIMIT = 1000;
const MAX_LIST_PAGES = 20;

/** The part of the `MEDIA` R2 binding the sweep uses. */
export type PdfCacheBucket = Pick<R2Bucket, "delete" | "list">;

export interface PdfCacheSweepOptions {
  /** Count what would be deleted and change nothing. */
  dryRun?: boolean;
  /** Listing pages this run (default 20; tests use fewer). */
  maxPages?: number;
  /** Keys per listing page (default 1000; tests use fewer). */
  pageSize?: number;
}

/** How many cached PDFs older than 30 days were deleted (or would be, in a dry run). */
export async function sweepStalePdfs(
  media: PdfCacheBucket,
  now: Date,
  {
    dryRun = false,
    maxPages = MAX_LIST_PAGES,
    pageSize = LIST_LIMIT,
  }: PdfCacheSweepOptions = {}
): Promise<number> {
  const cutoff = now.getTime() - LESSON_PDF_MAX_AGE_MS;
  let deleted = 0;
  let cursor: string | undefined;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each listing page depends on the previous page's cursor.
      const listed = await media.list({
        cursor,
        limit: pageSize,
        prefix: LESSON_PDF_PREFIX,
      });
      const stale = listed.objects
        .filter((object) => object.uploaded.getTime() < cutoff)
        .map((object) => object.key);
      if (stale.length > 0 && !dryRun) {
        await media.delete(stale);
      }
      deleted += stale.length;
      if (!listed.truncated) {
        break;
      }
      ({ cursor } = listed);
    }
  } catch (error) {
    console.error("[lessons] Failed to sweep the PDF cache:", error);
    throw error;
  }
  return deleted;
}
