// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { SPONSORSHIP_DEFAULTS } from "../collections/Sponsorships";
import config from "../payload.config";
import { createSponsorship, type NewSponsorship } from "./sponsorshipCreate";

/*
 * Every fixture value that lands on a `unique` column carries this, because
 * the local D1 under `.wrangler/state/vitest` is never cleared between runs
 * and a collision throws inside `beforeAll` — which Vitest reports as
 * *skipped* rather than failed, so the file looks green having tested
 * nothing.
 */
const RUN = crypto.randomUUID();

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("createSponsorship", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Create ${RUN}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Aanmaak ${RUN}`,
        playbackId: `pb-create-${RUN}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;
  });

  it("boots with the fixtures this file assumes", () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing looks green. This turns that into a named failure.
    expect(gestureId).toBeGreaterThan(0);
  });

  it("creates a sponsorship without naming status or durationYears", async () => {
    const row = await createSponsorship(payload, {
      contactFullName: "A Contact",
      endDate: new Date(Date.now() + YEAR_MS).toISOString(),
      gesture: gestureId,
      originalVideoPlaybackId: "pb-original",
      overlayText: "A Sponsor",
      paymentAmount: 4900,
      sponsorEmail: `sponsor-${crypto.randomUUID()}@example.test`,
      sponsorName: "A Sponsor",
      startDate: new Date().toISOString(),
    });

    // The defaults the field declares, proved to arrive rather than assumed.
    expect(row.status).toBe("pending_payment");
    expect(row.durationYears).toBe(1);

    // And they are the collection's own, not a second copy that has drifted.
    expect(row.status).toBe(SPONSORSHIP_DEFAULTS.status);
    expect(row.durationYears).toBe(SPONSORSHIP_DEFAULTS.durationYears);
  });

  it("still lets a caller name them, and keeps what they said", async () => {
    // The other half of the pair. Without it, a helper that ignored `data`
    // and always wrote the defaults would pass the test above.
    const row = await createSponsorship(payload, {
      contactFullName: "A Contact",
      durationYears: 3,
      endDate: new Date(Date.now() + 3 * YEAR_MS).toISOString(),
      gesture: gestureId,
      originalVideoPlaybackId: "pb-original",
      overlayText: "A Sponsor",
      paymentAmount: 14_700,
      sponsorEmail: `sponsor-${crypto.randomUUID()}@example.test`,
      sponsorName: "A Sponsor",
      startDate: new Date().toISOString(),
      status: "active",
    });

    expect(row.status).toBe("active");
    expect(row.durationYears).toBe(3);
  });

  it("passes the rest of the caller's data through untouched", async () => {
    const overlayText = `Met dank aan ${RUN}`;
    const row = await createSponsorship(payload, {
      contactFullName: "Jan Janssens",
      endDate: new Date(Date.now() + YEAR_MS).toISOString(),
      gesture: gestureId,
      invoiceRequested: true,
      invoiceVatNumber: "BE0123456789",
      originalVideoPlaybackId: `pb-original-${RUN}`,
      overlayText,
      paymentAmount: 4900,
      sponsorEmail: `sponsor-${crypto.randomUUID()}@example.test`,
      sponsorName: `Acme ${RUN}`,
      startDate: new Date().toISOString(),
    });

    expect(row.overlayText).toBe(overlayText);
    expect(row.invoiceVatNumber).toBe("BE0123456789");
    expect(row.paymentAmount).toBe(4900);
    // `create` returns the relationship populated at the default depth, so
    // this reads the id off the document rather than asserting the number.
    expect(typeof row.gesture === "object" ? row.gesture.id : row.gesture).toBe(
      gestureId
    );
  });

  it("will not compile a create that omits a genuinely required field", () => {
    // The point of `Omit` + `Partial` over a bare cast: everything except
    // the two fields with defaults is still checked. Without this, a
    // `NewSponsorship` that had degenerated to `any` would typecheck, run
    // green and be invisible — the mutation that widens it is only caught
    // because the directive below then has nothing to suppress and
    // `check-types` fails on the unused `@ts-expect-error`.
    const incomplete: NewSponsorship = {
      contactFullName: "A Contact",
      endDate: new Date(Date.now() + YEAR_MS).toISOString(),
      gesture: gestureId,
      originalVideoPlaybackId: "pb-original",
      overlayText: "A Sponsor",
      paymentAmount: 4900,
      sponsorEmail: "sponsor@example.test",
      // @ts-expect-error `sponsorName` is required, and is not one of the
      // two fields this type makes optional.
      sponsorName: undefined,
      startDate: new Date().toISOString(),
    };

    expect(incomplete.contactFullName).toBe("A Contact");
  });
});
