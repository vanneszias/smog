// @vitest-environment node
import { MAX_GESTURES_PER_SPONSORSHIP } from "@smog/config/constants";
import { getPayload, handleEndpoints } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { sponsoredGestureIds } from "@/lib/sponsorSelection";
import nextConfig from "../../next.config";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a collision on a unique column throws inside `beforeAll` —
 * which Vitest reports as *skipped* rather than failed, so the file looks green
 * having asserted nothing.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";
const START_PATH = "/api/sponsor/start";
const DAY = 24 * 60 * 60 * 1000;

/**
 * The sponsor wizard's endpoints, driven through `handleEndpoints` against a
 * real database.
 *
 * `handleEndpoints` rather than the handlers directly, for the reason
 * `auth.int.test.ts` and `mollie.int.test.ts` both give: half of what can go
 * wrong here is routing, and a handler called with a hand-built `req` passes
 * whatever path it is mounted at. It also means the `Origin` header is a real
 * header rather than a property somebody set, which is what `guardOrigin`
 * reads.
 */
describe("the sponsor wizard endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  /** Gesture ids by label, all active unless the label says otherwise. */
  const gestures: Record<string, number> = {};
  /** Eleven active gestures, one more than a sponsorship may cover. */
  let overCap: number[] = [];

  const createGesture = async (label: string, isActive = true) => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive,
        name: `Sponsor ${label} ${RUN}`,
        playbackId: `pb-sponsor-${label}-${RUN}`,
      },
      locale: "nl",
    });

    return gesture.id;
  };

  let categoryId: number;

  /**
   * A sponsorship on a gesture, with the term and status the caller names.
   *
   * `payload.create` rather than `createSponsorship`, so the fixture states
   * every field it depends on instead of inheriting a default that a later
   * task could change underneath it.
   */
  const sponsor = async (input: {
    endsIn: number;
    gesture: number;
    label: string;
    startedAgo: number;
    status:
      | "active"
      | "cancelled"
      | "expired"
      | "pending_approval"
      | "pending_payment"
      | "pending_resubmission"
      | "rejected";
  }) => {
    const now = Date.now();

    return await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Jan Janssens",
        durationYears: 1,
        endDate: new Date(now + input.endsIn).toISOString(),
        gesture: input.gesture,
        originalVideoPlaybackId: `pb-sponsor-${input.label}-${RUN}`,
        overlayText: `Met dank aan ${input.label} ${RUN}`,
        paymentAmount: 5000,
        sponsorEmail: `sponsor-${input.label}-${RUN}@example.com`,
        sponsorName: `Acme ${input.label}`,
        startDate: new Date(now - input.startedAgo).toISOString(),
        status: input.status,
      },
    });
  };

  /** One form post, exactly as the wizard's own form makes it. */
  const post = (
    path: string,
    fields: [string, string][],
    init: { origin?: null | string } = {}
  ) => {
    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    if (init.origin !== null) {
      headers.set("Origin", init.origin ?? SITE);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${path}`, {
        body: new URLSearchParams(fields).toString(),
        headers,
        method: "POST",
      }),
    });
  };

  /** A selection, as the checkboxes send it: one repeated field. */
  const start = (ids: (number | string)[], locale = "nl") =>
    post(START_PATH, [
      ["locale", locale],
      ...ids.map((id): [string, string] => ["gestureId", String(id)]),
    ]);

  /** Where a 303 sent the sponsor. */
  const destination = (response: Response) => response.headers.get("Location");

  /**
   * A successful landing, with the selection decoded.
   *
   * `URLSearchParams` percent-encodes the comma — as `gestureListHref` has
   * always done for `?category=` — so comparing the raw header would make
   * every expectation below read `1%2C2`. Parsing it instead keeps the
   * assertion about the contract (this path, these ids, in this order) rather
   * than about an encoding.
   */
  const detailsLanding = (response: Response) => {
    const url = new URL(destination(response) ?? "", SITE);

    return `${url.pathname}?gestures=${url.searchParams.get("gestures")}`;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Sponsor ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;

    for (const label of [
      "vrij",
      "ook-vrij",
      "ingetrokken",
      "verkocht",
      "verlopen",
      "onbetaald",
      "wachtrij",
      "herwerking",
      "geannuleerd",
    ]) {
      gestures[label] = await createGesture(label, label !== "ingetrokken");
    }

    overCap = [];
    for (let index = 0; index <= MAX_GESTURES_PER_SPONSORSHIP; index += 1) {
      overCap.push(await createGesture(`cap-${index}`));
    }

    await sponsor({
      endsIn: 300 * DAY,
      gesture: gestures.verkocht as number,
      label: "verkocht",
      startedAgo: DAY,
      status: "active",
    });

    /*
     * Active, but its term ran out and no job has expired it — Stage 7 owns
     * `expire-sponsorships` and does not exist yet, so this row genuinely
     * occurs in the data. The window is free and the gesture is for sale.
     */
    await sponsor({
      endsIn: -DAY,
      gesture: gestures.verlopen as number,
      label: "verlopen",
      startedAgo: 400 * DAY,
      status: "active",
    });

    /*
     * The three in-progress statuses, created directly rather than walked
     * there through the transition table: `enforceStatusTransitions` refuses
     * nothing on create, and a fixture that took four writes to reach one
     * status is four chances to leave it somewhere else.
     */
    await sponsor({
      endsIn: 300 * DAY,
      gesture: gestures.onbetaald as number,
      label: "onbetaald",
      startedAgo: DAY,
      status: "pending_payment",
    });

    await sponsor({
      endsIn: 300 * DAY,
      gesture: gestures.wachtrij as number,
      label: "wachtrij",
      startedAgo: DAY,
      status: "pending_approval",
    });

    await sponsor({
      endsIn: 300 * DAY,
      gesture: gestures.herwerking as number,
      label: "herwerking",
      startedAgo: DAY,
      status: "pending_resubmission",
    });

    /*
     * Cancelled: an answer, not a waypoint. The window is free again, and a
     * gesture that one refused payment made unsellable for ever would be a
     * worse bug than the one the blocking list exists for.
     */
    await sponsor({
      endsIn: 300 * DAY,
      gesture: gestures.geannuleerd as number,
      label: "geannuleerd",
      startedAgo: DAY,
      status: "cancelled",
    });
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing would look green. This turns that into a named
    // failure — and reads the three in-progress fixtures back, because a
    // `status` that silently failed to land would make three tests below
    // assert the same thing about `pending_payment`.
    expect(categoryId).toBeGreaterThan(0);
    expect(Object.keys(gestures)).toHaveLength(9);
    expect(overCap).toHaveLength(MAX_GESTURES_PER_SPONSORSHIP + 1);

    const statuses = await Promise.all(
      ["wachtrij", "herwerking", "geannuleerd"].map(async (label) => {
        const { docs } = await payload.find({
          collection: "sponsorships",
          depth: 0,
          limit: 1,
          overrideAccess: true,
          where: { overlayText: { equals: `Met dank aan ${label} ${RUN}` } },
        });

        return docs[0]?.status;
      })
    );

    expect(statuses).toEqual([
      "pending_approval",
      "pending_resubmission",
      "cancelled",
    ]);
  });

  it("is reachable at the path next.config.ts rewrites /sponsor/start to", async () => {
    // The form's `formaction` is `/sponsor/start`, which is not a path
    // Payload serves. Deleting this rewrite does not fail a handler test —
    // the handler is still mounted — it turns the wizard's first button into
    // a 404.
    const rewrites = await nextConfig.rewrites?.();
    const entries = Array.isArray(rewrites)
      ? rewrites
      : (rewrites?.afterFiles ?? []);

    expect(entries).toContainEqual({
      destination: START_PATH,
      source: "/sponsor/start",
    });

    // And the destination really resolves to this handler rather than to a
    // path that merely looks right.
    const response = await start([gestures.vrij as number]);

    expect(response.status).toBe(303);
  });

  it("refuses a cross-site post", async () => {
    const response = await start([gestures.vrij as number]);
    const forged = await post(
      START_PATH,
      [
        ["locale", "nl"],
        ["gestureId", String(gestures.vrij)],
      ],
      { origin: "https://evil.example" }
    );

    // The positive assertion beside the negative one: the same body from
    // this site is accepted, so a 403 that came from something other than
    // the origin check would fail here too.
    expect(response.status).toBe(303);
    expect(forged.status).toBe(403);
  });

  it("lists only active gestures as sponsorable", async () => {
    const active = await start([gestures.vrij as number]);
    const withdrawn = await start([gestures.ingetrokken as number]);

    expect(detailsLanding(active)).toBe(
      `/nl/sponsor/details?gestures=${gestures.vrij}`
    );
    // A deactivated gesture is not merely absent from the grid: it cannot be
    // bought by posting its id, which is Review Focus 2's "the selection
    // screen refusing it up front". `publicReadActive` is what does it, so
    // this also pins that the lookup runs with `overrideAccess: false`.
    expect(destination(withdrawn)).toBe("/nl/sponsor?error=gesture");
  });

  it("refuses a selection naming a gesture that does not exist", async () => {
    const missing = await start([999_000_001]);
    const notANumber = await start(["abc"]);
    const mixed = await start([gestures.vrij as number, 999_000_002]);

    expect(destination(missing)).toBe("/nl/sponsor?error=gesture");
    expect(destination(notANumber)).toBe("/nl/sponsor?error=gesture");
    // And one bad id poisons the whole order rather than being dropped: a
    // sponsor who thought they were buying two must not be charged for one.
    expect(destination(mixed)).toBe("/nl/sponsor?error=gesture");
  });

  it("refuses the same gesture twice in one selection", async () => {
    // The row-count comparison is what catches this — there is deliberately
    // no separate duplicate screen, for the reason `endpoints/mollie.ts`
    // records. Two ids come back as one row, so the counts disagree.
    const response = await start([
      gestures.vrij as number,
      gestures.vrij as number,
    ]);

    expect(destination(response)).toBe("/nl/sponsor?error=gesture");
  });

  it("refuses a selection of more than MAX_GESTURES_PER_SPONSORSHIP gestures", async () => {
    // **Ten, not twenty**, and imported rather than written as a literal.
    // Every one of the eleven is a real, active, unsponsored gesture, so the
    // cap is the only thing that can refuse this — priced the same way Task
    // 4's 21-sponsorship test had to be, or the resolve would mask it.
    const atCap = await start(overCap.slice(0, MAX_GESTURES_PER_SPONSORSHIP));
    const overTheCap = await start(overCap);

    expect(detailsLanding(atCap)).toBe(
      `/nl/sponsor/details?gestures=${overCap
        .slice(0, MAX_GESTURES_PER_SPONSORSHIP)
        .join(",")}`
    );
    expect(destination(overTheCap)).toBe("/nl/sponsor?error=too-many");
  });

  it("refuses an empty selection", async () => {
    const response = await start([]);

    expect(destination(response)).toBe("/nl/sponsor?error=empty");
  });

  it("refuses a selection whose only field is not a string", async () => {
    // A `gestureId` part that is a file rather than a value. Without the
    // `typeof` filter this arrives as a `File`, is stringified into the
    // `where` and refused as an unknown gesture — a different sentence for
    // the same mistake. With it, the selection is empty, which is what it is.
    const body = new FormData();
    body.set("locale", "nl");
    body.set("gestureId", new File(["7"], "id.txt", { type: "text/plain" }));

    const response = await handleEndpoints({
      config,
      request: new Request(`${SITE}${START_PATH}`, {
        body,
        headers: { Origin: SITE },
        method: "POST",
      }),
    });

    expect(destination(response)).toBe("/nl/sponsor?error=empty");
  });

  it("keeps the selection across the step boundary", async () => {
    const chosen = [gestures.vrij as number, gestures["ook-vrij"] as number];
    const response = await start(chosen);

    // The whole selection, in id order, in the URL step 2 renders from.
    // Nothing else carries it — no draft row, no cookie — so this header is
    // the entire contract between step 1 and step 2.
    expect(response.status).toBe(303);
    expect(detailsLanding(response)).toBe(
      `/nl/sponsor/details?gestures=${[...chosen].sort((a, b) => a - b).join(",")}`
    );
  });

  it("carries the locale the form posted, not the default", async () => {
    const response = await start([gestures.vrij as number], "fr");

    expect(detailsLanding(response)).toBe(
      `/fr/sponsor/details?gestures=${gestures.vrij}`
    );
  });

  it("refuses a gesture that already has an active sponsorship in term", async () => {
    const sold = await start([gestures.verkocht as number]);
    const alongside = await start([
      gestures.vrij as number,
      gestures.verkocht as number,
    ]);

    expect(destination(sold)).toBe("/nl/sponsor?error=sold");
    // One sold gesture refuses the whole order rather than quietly dropping
    // it: selling the same window twice is the failure that costs money to
    // unwind, and half an order is not what anybody asked for.
    expect(destination(alongside)).toBe("/nl/sponsor?error=sold");
  });

  it("sells a gesture whose active sponsorship's term has ended", async () => {
    // The positive assertion beside the negative one. Without it, a screen
    // that refused *every* gesture with any sponsorship row would pass the
    // test above and quietly take the whole catalogue off sale as it aged —
    // `expire-sponsorships` is Stage 7 and does not exist yet, so rows like
    // this one are real.
    const response = await start([gestures.verlopen as number]);

    expect(detailsLanding(response)).toBe(
      `/nl/sponsor/details?gestures=${gestures.verlopen}`
    );
  });

  it("refuses a gesture whose sponsorship is still awaiting payment", async () => {
    // **Wider than the plan asked for, and transcribed from the shipped
    // product.** `checkExistingSponsorship` in
    // `packages/convex/convex/lib/sponsorshipValidation.ts` refuses a gesture
    // with a `pending_payment` or `pending_approval` row, and every shipped
    // create path runs it. Without this, two sponsors can both select one
    // gesture, both pay, and the queue holds two sponsorships for one window.
    const response = await start([gestures.onbetaald as number]);

    expect(destination(response)).toBe("/nl/sponsor?error=sold");
  });

  it("refuses a gesture whose sponsorship is in the approval queue", async () => {
    const response = await start([gestures.wachtrij as number]);

    expect(destination(response)).toBe("/nl/sponsor?error=sold");
  });

  it("refuses a gesture whose sponsor is re-editing it", async () => {
    const response = await start([gestures.herwerking as number]);

    expect(destination(response)).toBe("/nl/sponsor?error=sold");
  });

  it("sells a gesture whose sponsorship was cancelled", async () => {
    const response = await start([gestures.geannuleerd as number]);

    expect(detailsLanding(response)).toBe(
      `/nl/sponsor/details?gestures=${gestures.geannuleerd}`
    );
  });

  it("names every sold gesture in a page of them, not just the first", async () => {
    /*
     * The selection screen greys a card out per gesture, so this has to
     * answer for all of them — where `start` only ever asks whether the set
     * is empty and would be satisfied by one. A page limit here would leave
     * the second and third sold gestures rendered with a checkbox, which is
     * an offer the checkout then refuses at the till.
     */
    const sold = await sponsoredGestureIds(payload, [
      gestures.verkocht as number,
      gestures.onbetaald as number,
      gestures.wachtrij as number,
      gestures.vrij as number,
      gestures.verlopen as number,
    ]);

    expect([...sold].sort((a, b) => a - b)).toEqual(
      [
        gestures.verkocht as number,
        gestures.onbetaald as number,
        gestures.wachtrij as number,
      ].sort((a, b) => a - b)
    );
  });

  it("writes nothing at all", async () => {
    // Step 1 is a validation step. A sponsorship row created here would be
    // one nothing sweeps until Stage 7's `cleanup-stale-payments`, for a
    // sponsor who only pressed "next".
    const before = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    await start([gestures.vrij as number, gestures["ook-vrij"] as number]);

    const after = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    expect(after.totalDocs).toBe(before.totalDocs);
  });
});
