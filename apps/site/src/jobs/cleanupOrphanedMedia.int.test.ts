// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrphanedMedia } from "@/jobs/cleanupOrphanedMedia";
import { SPONSOR_LOGO_PREFIX } from "@/lib/sponsorDraft";
import type { Media, Sponsorship } from "@/payload-types";
import config from "../payload.config";

/*
 * Unique per run: `.wrangler/state/vitest` is persisted and never cleared, and
 * `media.filename` carries a UNIQUE index. A collision throws inside
 * `beforeAll`, which Vitest reports as *skipped* rather than failed — a file
 * that looks green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PRICE = 5000;
const NOT_FOUND = 404;

/** A moment past the 24-hour window, so a row stored now counts as abandoned. */
const LATER = new Date(Date.now() + 25 * HOUR);

/** A 1x1 GIF, which is a real image and is 43 bytes. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * The orphaned-media sweep, against a real database and a real R2.
 *
 * **The dangerous half is the timing, not the reachability.** A logo that a
 * sponsor uploaded at step 2 and has not yet submitted at step 3 is *exactly*
 * as unreferenced as one nobody will ever submit: the id is in a hidden field
 * in a form, and no query can see it. So every test about deletion below has a
 * twin about age, and the boundary is asserted rather than assumed.
 *
 * The second danger is subtler: `media` is a general collection an
 * administrator may upload to, and an image they have uploaded but not yet used
 * is unreferenced in the same way. A sweep keyed on reachability alone would
 * delete their library a day later. So the sweep only ever looks at the
 * filenames this application writes, and there is a test for that too.
 *
 * R2 is real here: the objects are read back through the collection's own
 * static handler over HTTP, so "the file is gone" is a fetch rather than an
 * inference about a hook.
 */
describe("sweeping up a logo nothing points at", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const seedMedia = async (label: string, prefix = SPONSOR_LOGO_PREFIX) => {
    const media = await payload.create({
      collection: "media",
      data: { alt: `Logo van ${label}` },
      file: {
        data: PIXEL,
        mimetype: "image/gif",
        name: `${prefix}${label}-${RUN}.gif`,
        size: PIXEL.length,
      },
      overrideAccess: true,
    });

    return media as Media;
  };

  const seedSponsorship = async (
    label: string,
    options: { overlayImage: number; status?: Sponsorship["status"] }
  ): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Logo ${label} ${RUN}`,
        playbackId: `pb-logo-${label}-${RUN}`,
      },
      locale: "nl",
    });
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(Date.now() + 365 * DAY).toISOString(),
        gesture: gesture.id,
        originalVideoPlaybackId: `pb-logo-${label}-${RUN}`,
        overlayImage: options.overlayImage,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `logo-${label}-${RUN}@example.test`,
        sponsorName: `Acme ${label}`,
        startDate: new Date().toISOString(),
        status: options.status ?? "active",
      },
    });

    return row.id;
  };

  /** Whether the row is still in `media`. */
  const rowExists = async (id: number | string) => {
    const { totalDocs } = await payload.find({
      collection: "media",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { id: { equals: id } },
    });

    return totalDocs === 1;
  };

  /**
   * Whether the object is still in R2, asked over HTTP.
   *
   * The collection's own static handler, which the storage plugin mounts at
   * `/api/media/file/:filename` — so this is the bucket answering, not a
   * column. `handleEndpoints` rather than the handler directly, for the reason
   * `auth.int.test.ts` gives: half of what can go wrong is routing.
   */
  const fileExists = async (filename: null | string | undefined) => {
    if (!filename) {
      return false;
    }

    const response = await handleEndpoints({
      config,
      request: new Request(
        `${SITE}/api/media/file/${encodeURIComponent(filename)}`,
        { method: "GET" }
      ),
    });

    return response.status !== NOT_FOUND;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Logo ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    /*
     * This file's own leftovers, from this run and every earlier one. A sweep
     * is global and `.wrangler/state/vitest` is persisted, so a media row left
     * behind is one every future run reads — and every future run of
     * `cleanupStalePayments` beside it, since they share a task.
     */
    await payload.delete({
      collection: "media",
      overrideAccess: true,
      where: { alt: { like: "Logo van " } },
    });
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped* rather than failed, so a
    // run that seeded nothing would look green.
    expect(categoryId).toBeGreaterThan(0);

    const media = await seedMedia("boot");

    // And the premise every assertion below rests on: a stored logo really is
    // in R2, so "the file is gone" later is a change rather than a constant.
    expect(media.filename).toMatch(/^sponsor-logo-boot-/);
    expect(await fileExists(media.filename)).toBe(true);
  });

  it("removes a media row nothing references", async () => {
    const media = await seedMedia("orphan");

    const report = await cleanupOrphanedMedia(payload, LATER);

    expect(report.failures).toBe(0);
    expect(await rowExists(media.id)).toBe(false);
    // And the object with it, which is the half that costs storage rather than
    // a row in a table.
    expect(await fileExists(media.filename)).toBe(false);
  });

  it("keeps one a sponsorship references", async () => {
    const media = await seedMedia("used");

    await seedSponsorship("used", { overlayImage: Number(media.id) });

    await cleanupOrphanedMedia(payload, LATER);

    expect(await rowExists(media.id)).toBe(true);
    expect(await fileExists(media.filename)).toBe(true);
  });

  it("keeps one a sponsorship in a finished status references", async () => {
    /*
     * A cancelled or expired sponsorship is still the record of what a sponsor
     * was sold and what an administrator approved, and the admin panel and
     * `lib/renderPreview.ts` both render its overlay. Narrowing the
     * reachability query to `active` would delete the evidence behind every
     * finished sponsorship a day after it ended — which no test about an
     * active one would ever notice.
     */
    const media = await seedMedia("cancelled");

    await seedSponsorship("cancelled", {
      overlayImage: Number(media.id),
      status: "cancelled",
    });

    await cleanupOrphanedMedia(payload, LATER);

    expect(await rowExists(media.id)).toBe(true);
  });

  it("keeps one a draft still in flight references", async () => {
    /*
     * **The dangerous half.** At step 3 the logo is stored, the id is in a
     * hidden field, and nothing in the database points at it — so it is
     * indistinguishable from an abandoned one by reachability, and only its
     * age says otherwise.
     */
    const media = await seedMedia("inflight");

    const report = await cleanupOrphanedMedia(payload, new Date());

    expect(await rowExists(media.id)).toBe(true);
    expect(await fileExists(media.filename)).toBe(true);
    expect(report.failures).toBe(0);

    // And the *same* row goes once it is old enough, so what saved it was the
    // window and not something about this fixture.
    await cleanupOrphanedMedia(payload, LATER);

    expect(await rowExists(media.id)).toBe(false);
  });

  it("leaves one alone at the exact instant the window closes", async () => {
    /*
     * The boundary, asserted rather than assumed: a sponsor whose upload is
     * exactly twenty-four hours old is one comparison away from losing it
     * mid-checkout, and `<` against `<=` is the whole of it.
     *
     * The window is moved rather than the row, for the reason
     * `cleanupStalePayments.int.test.ts` gives: `createdAt` is Payload's own
     * column and a fixture cannot honestly backdate it.
     */
    const media = await seedMedia("boundary");
    const created = Date.parse(String(media.createdAt));

    await cleanupOrphanedMedia(payload, new Date(created + DAY));

    expect(await rowExists(media.id)).toBe(true);

    // One millisecond later it goes, so this is a boundary rather than a sweep
    // that never deletes anything.
    await cleanupOrphanedMedia(payload, new Date(created + DAY + 1));

    expect(await rowExists(media.id)).toBe(false);
  });

  it("leaves media this application did not upload for a sponsor alone", async () => {
    /*
     * **The difference between a cleanup and a disaster.** `media.create` is
     * `isAdmin`, so an administrator may upload anything to this collection —
     * and an image they have uploaded but not yet used is exactly as
     * unreferenced as an abandoned logo. A sweep keyed on reachability alone
     * deletes their library a day later, silently.
     *
     * The filename is the evidence, and it is evidence rather than a
     * convention: `endpoints/sponsorships.ts` names every logo itself, because
     * a client-supplied name is a client-supplied R2 key.
     */
    const library = await seedMedia("library", "admin-library-");
    /*
     * And one whose name *contains* the prefix without starting with it.
     * Without it this test would pass against a sweep that had only the
     * candidate query's `like`, which is a substring match on this adapter —
     * one guard standing in for another, which is how two mutations once
     * survived.
     */
    const lookalike = await seedMedia("tricky", "admin-sponsor-logo-");
    const logo = await seedMedia("alongside");

    const report = await cleanupOrphanedMedia(payload, LATER);

    expect(await rowExists(library.id)).toBe(true);
    expect(await fileExists(library.filename)).toBe(true);
    expect(await rowExists(lookalike.id)).toBe(true);

    // The positive beside the negative: a row that *is* a sponsor logo, stored
    // in the same second and just as unreferenced, does go — so this is the
    // filename refusing it and not a sweep that deleted nothing.
    expect(await rowExists(logo.id)).toBe(false);
    expect(report.deleted).toBeGreaterThanOrEqual(1);
  });

  it("deletes from R2 only after the row is gone, and survives a missing object", async () => {
    /*
     * Two halves of one ordering.
     *
     * **The order**, first. The sweep never touches R2: it deletes the row,
     * and the storage plugin's `afterDelete` takes the object out afterwards.
     * So a row whose deletion *fails* must still have its file — the other
     * order would leave a `media` row pointing at nothing, which is a broken
     * image on a sponsor's page rather than a stray object in a bucket.
     *
     * **A missing object**, second. An object that has already gone costs the
     * sweep nothing: the row still goes and the run still reports it.
     */
    const stubborn = await seedMedia("stubborn");
    const gone = await seedMedia("gone");

    const realDelete = payload.delete.bind(payload);
    let refused = false;

    payload.delete = (async (args: Parameters<typeof realDelete>[0]) => {
      if (
        !refused &&
        args.collection === "media" &&
        "id" in args &&
        String(args.id) === String(stubborn.id)
      ) {
        refused = true;

        throw new Error("the database said no");
      }

      return await realDelete(args);
    }) as typeof payload.delete;

    let report: Awaited<ReturnType<typeof cleanupOrphanedMedia>>;

    try {
      report = await cleanupOrphanedMedia(payload, LATER);
    } finally {
      payload.delete = realDelete;
    }

    expect(refused).toBe(true);
    expect(report.failures).toBe(1);
    // The row is still there *and so is its file*: nothing reached R2 ahead of
    // the row.
    expect(await rowExists(stubborn.id)).toBe(true);
    expect(await fileExists(stubborn.filename)).toBe(true);
    // And the sweep carried on to the next row rather than ending on the
    // first failure — the rows behind it have nothing else that will look.
    expect(await rowExists(gone.id)).toBe(false);

    /*
     * Now the missing object. The row below names a key that was never
     * written, which is what a bucket somebody has emptied by hand looks like
     * from in here — asserted through the static handler first, so this is a
     * staged absence rather than an assumption.
     */
    const orphaned = await seedMedia("nofile");

    await payload.db.updateOne({
      collection: "media",
      data: { filename: `${SPONSOR_LOGO_PREFIX}never-written-${RUN}.gif` },
      where: { id: { equals: orphaned.id } },
    });

    const renamed = await payload.findByID({
      collection: "media",
      depth: 0,
      id: orphaned.id,
      overrideAccess: true,
    });

    expect(await fileExists(renamed.filename)).toBe(false);

    const second = await cleanupOrphanedMedia(payload, LATER);

    expect(second.failures).toBe(0);
    expect(await rowExists(orphaned.id)).toBe(false);
  });
});
