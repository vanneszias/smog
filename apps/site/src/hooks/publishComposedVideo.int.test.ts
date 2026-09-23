// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a fixture that collided on a unique column would throw
 * inside `beforeAll` — which Vitest reports as *skipped* rather than failed, so
 * the file would look green having asserted nothing.
 */
const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;
const PRICE = 5000;

/** A 1x1 GIF, which is a real image and is 43 bytes. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

type Status =
  | "active"
  | "cancelled"
  | "expired"
  | "pending_approval"
  | "pending_payment"
  | "pending_resubmission"
  | "rejected";

/**
 * The two hooks that decide whether a composited video ever reaches a public
 * page, and whether the one that reaches it is of the overlay that was
 * approved.
 *
 * ## Why this is the hook that matters
 *
 * `POST /api/render/callback` writes `previewVideoPlaybackId`, which nothing
 * public reads. `lib/sponsorOverlay.ts` reads `sponsoredVideoPlaybackId`, and
 * the copy between the two is made here, when an administrator approves. That
 * copy is the whole of "a person is in between": no callback, however well
 * signed, can put a video on a gesture page without one.
 *
 * ## Why the second hook exists
 *
 * `rejected -> pending_resubmission` is a legal move (`lib/sponsorshipStatus.ts`,
 * and an administrator may re-open a rejected sponsorship), so a sponsorship
 * can carry a composite made *before* a rejection and then come back through
 * the approval queue with different text and a different logo. Copying blindly
 * on approval would put the rejected submission's video live the moment the
 * re-edit is approved — the sponsor's correction visible nowhere but the
 * database.
 *
 * So a write that changes the overlay throws the composite away. That is a
 * property of the *content*, not of the endpoint that changed it, which is why
 * it is a hook and not a line in `endpoints/sponsorships.ts`: the re-edit form
 * and an administrator editing the text in the admin panel both go through it.
 *
 * `enforceStatusTransitions` is not a second line of defence behind either of
 * them. It compares `originalDoc.status` with `data.status` and allows
 * `from === to`, so it has nothing to say about a write that changes only a
 * playback id — `endpoints/render.int.test.ts` proves that directly.
 */
describe("publishing a composed video", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;
  let logoId: number;
  let otherLogoId: number;

  const seed = async (
    label: string,
    overrides: {
      overlayImage?: null | number;
      previewVideoPlaybackId?: null | string;
      sponsoredVideoPlaybackId?: null | string;
      status?: Status;
    } = {}
  ) => {
    const now = Date.now();
    const row = await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + 365 * DAY).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `pb-original-${RUN}`,
        overlayText: `Met dank aan ${label}`,
        paymentAmount: PRICE,
        sponsorEmail: `approve-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        startDate: new Date(now).toISOString(),
        status: overrides.status ?? "pending_approval",
        ...(overrides.overlayImage === undefined
          ? {}
          : { overlayImage: overrides.overlayImage }),
        ...(overrides.previewVideoPlaybackId === undefined
          ? {}
          : { previewVideoPlaybackId: overrides.previewVideoPlaybackId }),
        ...(overrides.sponsoredVideoPlaybackId === undefined
          ? {}
          : { sponsoredVideoPlaybackId: overrides.sponsoredVideoPlaybackId }),
      },
      overrideAccess: true,
    });

    return row.id;
  };

  const update = (id: number, data: Record<string, unknown>) =>
    payload.update({
      collection: "sponsorships",
      data,
      id,
      overrideAccess: true,
    });

  const read = (id: number) =>
    payload.findByID({ collection: "sponsorships", depth: 0, id });

  const newLogo = async (label: string) => {
    const media = await payload.create({
      collection: "media",
      data: { alt: `Logo ${label} ${RUN}` },
      file: {
        data: PIXEL,
        mimetype: "image/gif",
        name: `logo-${label}-${RUN}.gif`,
        size: PIXEL.length,
      },
      overrideAccess: true,
    });

    return media.id;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Goedkeuren ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Goedkeuren ${RUN}`,
        playbackId: `pb-approve-${RUN}`,
      },
      locale: "nl",
    });

    gestureId = gesture.id;
    logoId = await newLogo("eerste");
    otherLogoId = await newLogo("tweede");
  });

  it("boots with the fixtures this file assumes", () => {
    expect(gestureId).toBeGreaterThan(0);
    expect(logoId).toBeGreaterThan(0);
    expect(otherLogoId).not.toBe(logoId);
  });

  it("puts the composed video on the public page when an administrator approves", async () => {
    const id = await seed("approved", {
      previewVideoPlaybackId: `pb-composed-${RUN}`,
    });

    const after = await update(id, { status: "active" });

    expect(after.status).toBe("active");
    expect(after.sponsoredVideoPlaybackId).toBe(`pb-composed-${RUN}`);
    // The preview stays: it is the record of what was composed, and the
    // sponsor's own review page keeps playing it.
    expect(after.previewVideoPlaybackId).toBe(`pb-composed-${RUN}`);
    expect((await read(id)).sponsoredVideoPlaybackId).toBe(
      `pb-composed-${RUN}`
    );
  });

  it("approves a sponsorship that has no composed video at all", async () => {
    // A render that failed, or one that never ran because Remotion Lambda is
    // not configured — which is every environment today. The approval must
    // still work: the gesture page falls back to the original video and draws
    // the overlay in HTML.
    const id = await seed("no-composite");

    const after = await update(id, { status: "active" });

    expect(after.status).toBe("active");
    expect(after.sponsoredVideoPlaybackId ?? null).toBeNull();
  });

  it("copies nothing on any move that is not an approval", async () => {
    /*
     * Priced so only the guard under test can refuse: every one of these rows
     * carries a composite, and the one that is approved below gets it. What
     * separates them is the transition and nothing else.
     */
    const paid = await seed("paid", {
      previewVideoPlaybackId: `pb-paid-${RUN}`,
      status: "pending_payment",
    });
    await update(paid, { status: "pending_approval" });
    expect((await read(paid)).sponsoredVideoPlaybackId ?? null).toBeNull();

    const renamed = await seed("renamed", {
      previewVideoPlaybackId: `pb-renamed-${RUN}`,
    });
    await update(renamed, { sponsorName: "Acme Holding" });
    expect((await read(renamed)).sponsoredVideoPlaybackId ?? null).toBeNull();

    const refused = await seed("refused", {
      previewVideoPlaybackId: `pb-refused-${RUN}`,
    });
    await update(refused, {
      rejectionReason: "De tekst past niet in beeld.",
      status: "rejected",
    });
    expect((await read(refused)).sponsoredVideoPlaybackId ?? null).toBeNull();

    // The positive beside the three negatives.
    const approved = await seed("contrast", {
      previewVideoPlaybackId: `pb-contrast-${RUN}`,
    });
    await update(approved, { status: "active" });
    expect((await read(approved)).sponsoredVideoPlaybackId).toBe(
      `pb-contrast-${RUN}`
    );
  });

  it("does not overwrite a video that is already the live one", async () => {
    // The preview is copied only when `sponsoredVideoPlaybackId` is empty,
    // and that matters for a row imported with a composite already in place,
    // where the preview column may hold something older.
    const id = await seed("already-live", {
      previewVideoPlaybackId: `pb-newer-${RUN}`,
      sponsoredVideoPlaybackId: `pb-already-live-${RUN}`,
    });

    await update(id, { status: "active" });

    expect((await read(id)).sponsoredVideoPlaybackId).toBe(
      `pb-already-live-${RUN}`
    );
  });

  it("throws the composite away when the overlay text changes", async () => {
    /*
     * The composite has the old words burned into it. Keeping it would mean
     * the sponsor's correction exists in the database and nowhere on screen.
     */
    const id = await seed("retext", {
      previewVideoPlaybackId: `pb-retext-${RUN}`,
    });

    const after = await update(id, { overlayText: "Met dank aan Acme BV" });

    expect(after.overlayText).toBe("Met dank aan Acme BV");
    expect(after.previewVideoPlaybackId ?? null).toBeNull();
  });

  it("throws the composite away when the logo changes", async () => {
    const id = await seed("relogo", {
      overlayImage: logoId,
      previewVideoPlaybackId: `pb-relogo-${RUN}`,
    });

    const after = await update(id, { overlayImage: otherLogoId });

    expect(after.previewVideoPlaybackId ?? null).toBeNull();
  });

  it("keeps the composite when the write changes neither", async () => {
    /*
     * The positive beside both negatives, and the one that stops the guard
     * being "clear it on every update", which would delete the callback's own
     * write the moment anything else touched the row. The fixture carries a
     * logo, so the relationship comparison is exercised on a row where it is
     * *not* null — a comparison that got that wrong would clear here.
     */
    const id = await seed("untouched", {
      overlayImage: logoId,
      previewVideoPlaybackId: `pb-untouched-${RUN}`,
    });

    await update(id, { invoiceRequested: true });
    expect((await read(id)).previewVideoPlaybackId).toBe(`pb-untouched-${RUN}`);

    // Including the callback's own write, which sets the preview and nothing
    // else: if that cleared it, no render would ever survive its own callback.
    const fresh = await seed("callback-write");
    await update(fresh, { previewVideoPlaybackId: `pb-callback-${RUN}` });
    expect((await read(fresh)).previewVideoPlaybackId).toBe(
      `pb-callback-${RUN}`
    );
  });

  it("does not publish a composite the same write invalidated", async () => {
    /*
     * The ordering test. An administrator who fixes the overlay text *and*
     * approves in one save must not publish the video of the text they just
     * replaced — so the hook that throws the composite away runs before the one
     * that publishes it, and swapping the two puts a stale video on a public
     * page.
     */
    const id = await seed("fix-and-approve", {
      previewVideoPlaybackId: `pb-stale-${RUN}`,
    });

    const after = await update(id, {
      overlayText: "Met dank aan Acme NV",
      status: "active",
    });

    expect(after.status).toBe("active");
    expect(after.previewVideoPlaybackId ?? null).toBeNull();
    expect(after.sponsoredVideoPlaybackId ?? null).toBeNull();
  });

  it("does not publish the video a sponsor was made to re-edit", async () => {
    /*
     * **The whole scenario, end to end**, and the reason the second hook
     * exists. A composite is made while the sponsorship is in the queue; an
     * administrator rejects it, then re-opens it for a re-edit; the sponsor
     * changes the text and it returns to the queue; an administrator approves.
     *
     * Every step is a legal transition, and without the invalidation the last
     * one publishes the video of the submission that was *rejected*.
     */
    const id = await seed("re-edited", {
      previewVideoPlaybackId: `pb-rejected-${RUN}`,
    });

    await update(id, {
      rejectionReason: "De naam is verkeerd gespeld.",
      status: "rejected",
    });
    await update(id, { status: "pending_resubmission" });
    await update(id, {
      overlayText: "Met dank aan Acme",
      sponsorName: "Acme",
      status: "pending_approval",
    });

    expect((await read(id)).previewVideoPlaybackId ?? null).toBeNull();

    const approved = await update(id, { status: "active" });

    expect(approved.status).toBe("active");
    expect(approved.sponsoredVideoPlaybackId ?? null).toBeNull();

    // And the positive: a composite made *after* the re-edit does go live.
    const recomposed = await update(id, {
      previewVideoPlaybackId: `pb-recomposed-${RUN}`,
    });

    expect(recomposed.previewVideoPlaybackId).toBe(`pb-recomposed-${RUN}`);
  });
});
