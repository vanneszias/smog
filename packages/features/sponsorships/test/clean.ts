/**
 * The sweeps read every row of a status, so their tests start from empty
 * sponsorship tables (children first: `payment_item` and `sponsorship`
 * restrict their parents' deletes).
 */
import type { Db } from "@smog/db/client";
import { sql } from "drizzle-orm";

const TABLES = [
  "sponsorship_event",
  "sponsorship_token",
  "render_job",
  "payment_item",
  "payment",
  "sponsorship",
  "invoice_request",
  "sponsor",
] as const;

export async function clearSponsorships(db: Db): Promise<void> {
  const [first, ...rest] = TABLES.map((table) =>
    db.run(sql.raw(`DELETE FROM ${table}`))
  );
  if (first) {
    await db.batch([first, ...rest]);
  }
}

/** Every object in the bucket, removed (the logo sweep's tests). */
export async function clearBucket(bucket: R2Bucket): Promise<void> {
  let cursor: string | undefined;
  do {
    // biome-ignore lint/performance/noAwaitInLoops: pages of a listing, in order.
    const listed = await bucket.list(cursor ? { cursor } : {});
    if (listed.objects.length > 0) {
      await bucket.delete(listed.objects.map((object) => object.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
