// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";
import { fetchGestureOverlay } from "./sponsorOverlay";

const RUN = crypto.randomUUID();

const DAY = 24 * 60 * 60 * 1000;

/** The exact key set the projection is allowed to return. Sorted, see below. */
const OVERLAY_KEYS = [
  "hasLogo",
  "overlayImage",
  "overlayText",
  "sponsoredVideoPlaybackId",
];

/** A 1x1 transparent GIF, so `media` has a real file to store. */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

describe("fetchGestureOverlay", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;
  let mediaId: number;

  /** Ids of gestures, one per sponsorship state under test. */
  const gestures: Record<string, number> = {};
  let activeSponsorshipId: number;

  const createGesture = async (label: string): Promise<number> => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Overlay ${label} ${RUN}`,
        playbackId: `pb-overlay-${RUN}-${label}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  /**
   * A sponsorship whose every PII field is filled in.
   *
   * Filled deliberately rather than left blank: the projection test asserts
   * that none of it comes back, and a test whose fixture has no contact
   * details cannot tell a projection from a whole document.
   */
  const createSponsorship = async (
    label: string,
    overrides: {
      endDate: string;
      startDate: string;
      status:
        | "active"
        | "cancelled"
        | "expired"
        | "pending_approval"
        | "pending_payment"
        | "pending_resubmission"
        | "rejected";
      gesture: number;
      hasLogo?: boolean;
      overlayImage?: number;
      sponsoredVideoPlaybackId?: string;
    }
  ) => {
    return await payload.create({
      collection: "sponsorships",
      data: {
        contactCompany: "Acme Holding NV",
        contactFullName: "Jan Janssens",
        durationYears: 1,
        invoiceEmail: `facturen-${label}-${RUN}@example.com`,
        invoiceName: "Acme NV",
        invoiceRequested: true,
        invoiceVatNumber: `BE0${RUN.replaceAll("-", "").slice(0, 9)}`,
        originalVideoPlaybackId: `orig-${RUN}-${label}`,
        overlayText: `Met dank aan ${label} ${RUN}`,
        paymentAmount: 500,
        reEditToken: `reedit-${RUN}-${label}`,
        sponsorEmail: `sponsor-${label}-${RUN}@example.com`,
        sponsorName: `Acme ${label}`,
        ...overrides,
      },
    });
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Overlay ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;

    const media = await payload.create({
      collection: "media",
      data: { alt: `Logo van Acme ${RUN}` },
      file: {
        data: PIXEL,
        mimetype: "image/gif",
        name: `acme-${RUN}.gif`,
        size: PIXEL.byteLength,
      },
    });
    mediaId = media.id;

    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();

    for (const label of [
      "actief",
      "verlopen",
      "toekomst",
      "onbetaald",
      "geannuleerd",
      "kaal",
      "zonder",
    ]) {
      gestures[label] = await createGesture(label);
    }

    const active = await createSponsorship("actief", {
      endDate: iso(30 * DAY),
      gesture: gestures.actief as number,
      hasLogo: true,
      overlayImage: mediaId,
      sponsoredVideoPlaybackId: `spon-${RUN}`,
      startDate: iso(-30 * DAY),
      status: "active",
    });
    activeSponsorshipId = active.id;

    // `status: "active"` with an `endDate` in the past is not a contrived
    // fixture: Stage 1 shipped no expiry job and no status-transition
    // enforcement, so this row shape genuinely exists in the data.
    await createSponsorship("verlopen", {
      endDate: iso(-DAY),
      gesture: gestures.verlopen as number,
      startDate: iso(-365 * DAY),
      status: "active",
    });

    await createSponsorship("toekomst", {
      endDate: iso(395 * DAY),
      gesture: gestures.toekomst as number,
      startDate: iso(30 * DAY),
      status: "active",
    });

    await createSponsorship("onbetaald", {
      endDate: iso(365 * DAY),
      gesture: gestures.onbetaald as number,
      startDate: iso(-DAY),
      status: "pending_payment",
    });

    await createSponsorship("geannuleerd", {
      endDate: iso(365 * DAY),
      gesture: gestures.geannuleerd as number,
      startDate: iso(-DAY),
      status: "cancelled",
    });

    // In term and active, but with no logo, no image and no sponsored cut.
    await createSponsorship("kaal", {
      endDate: iso(DAY),
      gesture: gestures.kaal as number,
      startDate: iso(-DAY),
      status: "active",
    });
  });

  it("boots with the fixtures this file assumes", () => {
    expect(mediaId).toBeGreaterThan(0);
    expect(activeSponsorshipId).toBeGreaterThan(0);
    expect(Object.keys(gestures)).toHaveLength(7);
  });

  it("returns the overlay for a sponsorship that is active and in term", async () => {
    const overlay = await fetchGestureOverlay(gestures.actief as number);

    expect(overlay).not.toBeNull();
    expect(overlay?.overlayText).toBe(`Met dank aan actief ${RUN}`);
    expect(overlay?.sponsoredVideoPlaybackId).toBe(`spon-${RUN}`);
    expect(overlay?.hasLogo).toBe(true);
    expect(overlay?.overlayImage).toEqual({
      alt: `Logo van Acme ${RUN}`,
      url: expect.stringContaining(`acme-${RUN}.gif`),
    });
  });

  it("never returns the sponsor's contact details", async () => {
    const overlay = await fetchGestureOverlay(gestures.actief as number);

    // Sorted on both sides rather than written in the plan's order: Biome's
    // `useSortedKeys` assist rewrites the object literal in the
    // implementation, so pinning insertion order would pin a formatter's
    // behaviour instead of the projection's. The assertion that matters is
    // that the set is *exactly* these four — a projection that grew a fifth
    // key, or one replaced by the whole document, fails here.
    expect(Object.keys(overlay ?? {}).sort()).toEqual(OVERLAY_KEYS);
  });

  it("does not leak the sponsor's email even as a nested value", async () => {
    // The key-set assertion above catches a top-level leak. This catches the
    // other shape it comes in: a whole document nested under one of the four
    // keys, or a populated relationship dragging the row along with it.
    const overlay = await fetchGestureOverlay(gestures.actief as number);

    expect(JSON.stringify(overlay)).not.toContain(`sponsor-actief-${RUN}`);
    expect(JSON.stringify(overlay)).not.toContain("BE0");
    expect(JSON.stringify(overlay)).not.toContain("Jan Janssens");
    expect(JSON.stringify(overlay)).not.toContain(`reedit-${RUN}`);
  });

  it("returns null when the only sponsorship has expired", async () => {
    // The status still says `active`. Only the term says otherwise, and the
    // term is what decides.
    const overlay = await fetchGestureOverlay(gestures.verlopen as number);

    expect(overlay).toBeNull();
  });

  it("returns null when the sponsorship has not started yet", async () => {
    const overlay = await fetchGestureOverlay(gestures.toekomst as number);

    expect(overlay).toBeNull();
  });

  it("returns null when the sponsorship is pending payment", async () => {
    const overlay = await fetchGestureOverlay(gestures.onbetaald as number);

    expect(overlay).toBeNull();
  });

  it("returns null when the sponsorship was cancelled", async () => {
    const overlay = await fetchGestureOverlay(gestures.geannuleerd as number);

    expect(overlay).toBeNull();
  });

  it("returns null when the gesture has no sponsorship at all", async () => {
    const overlay = await fetchGestureOverlay(gestures.zonder as number);

    expect(overlay).toBeNull();
  });

  it("returns null for a gesture id that is not a number rather than throwing", async () => {
    // The page passes the id off the document it already loaded, so this
    // should be unreachable — but a `NaN` that silently dropped the gesture
    // clause would hand one gesture's page another gesture's sponsor, which
    // is the one failure mode worth a test of its own.
    await expect(fetchGestureOverlay("banana")).resolves.toBeNull();
  });

  it("accepts the string id the URL carries", async () => {
    const overlay = await fetchGestureOverlay(String(gestures.actief));

    expect(overlay?.overlayText).toBe(`Met dank aan actief ${RUN}`);
  });

  it("reports the absent fields as null and false rather than undefined", async () => {
    // A sponsorship with no logo, no image and no sponsored cut is still a
    // sponsorship: its text must render, and the other three must be values
    // the page can branch on rather than holes.
    const overlay = await fetchGestureOverlay(gestures.kaal as number);

    expect(overlay).toEqual({
      hasLogo: false,
      overlayImage: null,
      overlayText: `Met dank aan kaal ${RUN}`,
      sponsoredVideoPlaybackId: null,
    });
  });

  it("does not let an anonymous read reach the sponsorship itself", async () => {
    // The projection runs `overrideAccess: true` on the server. That must not
    // have been achieved by loosening `sponsorships.read`, which is the whole
    // point of building a projection instead.
    await expect(
      payload.find({
        collection: "sponsorships",
        overrideAccess: false,
        user: undefined,
        where: { id: { equals: activeSponsorshipId } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("does not let a signed-in non-admin read the sponsorship either", async () => {
    await expect(
      payload.find({
        collection: "sponsorships",
        overrideAccess: false,
        user: { collection: "users", id: 2, role: "user" } as never,
        where: { id: { equals: activeSponsorshipId } },
      })
    ).rejects.toBeInstanceOf(Forbidden);
  });
});
