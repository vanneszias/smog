// @vitest-environment node
import { MAX_GESTURES_PER_SPONSORSHIP } from "@smog/config/constants";
import { getPayload, handleEndpoints } from "payload";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sponsorshipAmountCents } from "@/lib/pricing";
import {
  decodeSponsorDraft,
  MAX_LOGO_BYTES,
  SPONSOR_DRAFT_COOKIE,
} from "@/lib/sponsorDraft";
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
const DETAILS_PATH = "/api/sponsor/details";
const CHECKOUT_PATH = "/api/sponsor/checkout";
const DAY = 24 * 60 * 60 * 1000;

/**
 * Puts a variable back the way it was, including back to *absent*.
 *
 * `process.env.X = undefined` does not unset X — Node coerces the value and
 * leaves the string `"undefined"` behind — and `vitest.config.mts` sets
 * `isolate: false`, so every file this worker runs afterwards shares this
 * process. A leftover `REMOTION_FUNCTION_NAME="undefined"` would put a later
 * file's checkout down the configured branch of a seam that cannot submit.
 */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = value;
}

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

/*
 * A stand-in, never a real credential, and deliberately not shaped like a
 * Mollie key (`live_…` / `test_…`) so a secret scanner has nothing to flag.
 * Read and restored through `process.env.MOLLIE_API_KEY` on every line that
 * mentions it, so that
 *   grep -rn "MOLLIE_API_KEY" apps/site/src | grep -v "process.env.MOLLIE_API_KEY"
 * still prints nothing.
 */
const STUB_KEY = "stub-key-for-tests-only";
const MOLLIE_PREFIX = "https://api.mollie.com/";

/**
 * Steps 2 and 3, with Mollie's half of the conversation stubbed at `fetch`.
 *
 * Only `api.mollie.com` is intercepted. The D1 emulator behind
 * `getPlatformProxy` talks over `fetch` too, so a blanket `vi.stubGlobal` that
 * answered every request would break the database rather than the payment
 * provider.
 *
 * **Every checkout test buys its own gestures.** A successful checkout leaves
 * a `pending_payment` row, which takes that gesture off sale for every test
 * after it — sharing a fixture here would make the second test fail with
 * `error=sold` for a reason that has nothing to do with what it asserts.
 */
describe("the sponsor wizard, steps 2 and 3", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: number;

  const realFetch = globalThis.fetch;
  const ORIGINAL_KEY = process.env.MOLLIE_API_KEY;

  /** Every request this test's code made to Mollie, body parsed. */
  let mollieCalls: { body: Record<string, unknown>; url: string }[] = [];
  /** What the next `POST /v2/payments` answers. */
  let mollieAnswer: () => Response;

  /** A 1x1 GIF, which is a real image and is 43 bytes. */
  const PIXEL = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status,
    });

  const paymentAccepted = (id: string) => () =>
    jsonResponse({
      _links: { checkout: { href: `https://www.mollie.com/checkout/${id}` } },
      id,
    });

  const paymentRefused = () => () =>
    jsonResponse(
      { detail: "The amount is invalid", title: "Bad Request" },
      422
    );

  const newGesture = async (label: string) => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive: true,
        name: `Betalen ${label} ${crypto.randomUUID()}`,
        playbackId: `pb-pay-${crypto.randomUUID()}`,
      },
      locale: "nl",
    });

    return gesture;
  };

  const newGestures = async (count: number, label: string) => {
    const created: Awaited<ReturnType<typeof newGesture>>[] = [];

    for (let index = 0; index < count; index += 1) {
      created.push(await newGesture(`${label}-${index}`));
    }

    return created;
  };

  /** The details a well-formed step 2 carries, before any override. */
  const goodDetails = (): Record<string, string> => ({
    contactFullName: "Jan Janssens",
    locale: "nl",
    sponsorEmail: "jan@example.com",
    sponsorName: "Acme",
  });

  /**
   * One form post.
   *
   * `site` and `originHeader` are separate on purpose: `guardOrigin` compares
   * the `Origin` header with the request's *own* origin, so a helper that set
   * both from one value would make a "cross-site" request whose two origins
   * agree — a test that passes by never exercising the guard.
   */
  const formPost = (
    path: string,
    fields: Record<string, string>,
    gestureIds: (number | string)[],
    init: { originHeader?: string; site?: string } = {}
  ) => {
    const body = new URLSearchParams(Object.entries(fields));

    for (const id of gestureIds) {
      body.append("gestureId", String(id));
    }

    const site = init.site ?? SITE;

    return handleEndpoints({
      config,
      request: new Request(`${site}${path}`, {
        body: body.toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: init.originHeader ?? site,
        },
        method: "POST",
      }),
    });
  };

  /** Step 2 as the real form makes it: multipart, because of the logo. */
  const multipartDetails = (
    fields: Record<string, string>,
    gestureIds: (number | string)[],
    logo?: File
  ) => {
    const body = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      body.append(name, value);
    }

    for (const id of gestureIds) {
      body.append("gestureId", String(id));
    }

    if (logo !== undefined) {
      body.append("logo", logo);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${DETAILS_PATH}`, {
        body,
        headers: { Origin: SITE },
        method: "POST",
      }),
    });
  };

  const destination = (response: Response) => response.headers.get("Location");

  /** The draft step 2 handed to step 3, decoded out of its own cookie. */
  const draftFrom = (response: Response) => {
    const cookie = response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith(`${SPONSOR_DRAFT_COOKIE}=`));

    if (cookie === undefined) {
      return null;
    }

    return decodeSponsorDraft(
      cookie.slice(`${SPONSOR_DRAFT_COOKIE}=`.length).split(";")[0] ?? null
    );
  };

  const rowsFor = async (gestureIds: number[]) => {
    const { docs } = await payload.find({
      collection: "sponsorships",
      depth: 0,
      overrideAccess: true,
      pagination: false,
      sort: "id",
      where: { gesture: { in: gestureIds } },
    });

    return docs;
  };

  beforeAll(async () => {
    process.env.MOLLIE_API_KEY = STUB_KEY;
    payload = await getPayload({ config });

    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (!url.startsWith(MOLLIE_PREFIX)) {
        return realFetch(input as RequestInfo, init);
      }

      mollieCalls.push({
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        url,
      });

      return Promise.resolve(mollieAnswer());
    });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Betalen ${RUN}` },
      locale: "nl",
    });
    categoryId = category.id;
  });

  beforeEach(() => {
    mollieCalls = [];
    mollieAnswer = paymentAccepted(`tr_${crypto.randomUUID().slice(0, 8)}`);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    process.env.MOLLIE_API_KEY = ORIGINAL_KEY;
  });

  it("boots with the fixtures this file assumes", () => {
    expect(categoryId).toBeGreaterThan(0);
    expect(process.env.MOLLIE_API_KEY).toBe(STUB_KEY);
  });

  it("is reachable at the paths next.config.ts rewrites /sponsor/* to", async () => {
    const rewrites = await nextConfig.rewrites?.();
    const entries = Array.isArray(rewrites)
      ? rewrites
      : (rewrites?.afterFiles ?? []);

    expect(entries).toContainEqual({
      destination: DETAILS_PATH,
      source: "/sponsor/details",
    });
    expect(entries).toContainEqual({
      destination: CHECKOUT_PATH,
      source: "/sponsor/checkout",
    });

    // And both destinations really resolve to their handlers.
    const [gesture] = await newGestures(1, "rewrite");
    const details = await formPost(DETAILS_PATH, goodDetails(), [
      gesture?.id as number,
    ]);

    expect(details.status).toBe(303);
    expect(destination(details)).toBe("/nl/sponsor/preview");
  });

  it("refuses a cross-site post to either step", async () => {
    const [gesture] = await newGestures(1, "cross-site");
    const accepted = await formPost(DETAILS_PATH, goodDetails(), [
      gesture?.id as number,
    ]);
    const forgedDetails = await formPost(
      DETAILS_PATH,
      goodDetails(),
      [gesture?.id as number],
      { originHeader: "https://evil.example" }
    );
    const forgedCheckout = await formPost(
      CHECKOUT_PATH,
      goodDetails(),
      [gesture?.id as number],
      { originHeader: "https://evil.example" }
    );

    // The positive assertion beside the two negative ones: the same body from
    // this site is accepted, so a 403 from anything but the origin check
    // would fail here too.
    expect(accepted.status).toBe(303);
    expect(forgedDetails.status).toBe(403);
    expect(forgedCheckout.status).toBe(403);
    // And a refused checkout charged nobody.
    expect(mollieCalls).toEqual([]);
  });

  it("refuses a sponsor email that is not an address", async () => {
    const [gesture] = await newGestures(1, "email");
    const id = gesture?.id as number;

    const bad = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), sponsorEmail: "jan-at-example.com" },
      [id]
    );
    const blank = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), sponsorEmail: "" },
      [id]
    );
    const good = await formPost(DETAILS_PATH, goodDetails(), [id]);

    expect(destination(bad)).toBe(
      `/nl/sponsor/details?error=email&gestures=${id}`
    );
    expect(destination(blank)).toBe(
      `/nl/sponsor/details?error=email&gestures=${id}`
    );
    // The positive one: the same post with an address gets through, so the
    // refusal above is the email rule and not something else in the form.
    expect(destination(good)).toBe("/nl/sponsor/preview");
  });

  it("requires overlay text, and bounds its length", async () => {
    /*
     * **The overlay text is the sponsor name.** The shipped wizard has one
     * input for both — `apps/web/.../-StepDetails.tsx` caps it at 35 and
     * `-useSponsorshipMutation.ts` sends `overlayText: form.sponsorName` — so
     * this bounds `sponsorName` and the row's `overlayText` is asserted to be
     * the same string further down.
     */
    const [gesture] = await newGestures(1, "overlay");
    const id = gesture?.id as number;

    const blank = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), sponsorName: "   " },
      [id]
    );
    const tooLong = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), sponsorName: "x".repeat(36) },
      [id]
    );
    const atTheLimit = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), sponsorName: "x".repeat(35) },
      [id]
    );

    expect(destination(blank)).toBe(
      `/nl/sponsor/details?error=name&gestures=${id}`
    );
    expect(destination(tooLong)).toBe(
      `/nl/sponsor/details?error=name&gestures=${id}`
    );
    // Exactly at the bound is accepted, which is what makes the refusal above
    // a bound rather than a blanket refusal of long-ish names.
    expect(destination(atTheLimit)).toBe("/nl/sponsor/preview");
    expect(draftFrom(atTheLimit)?.sponsorName).toBe("x".repeat(35));
  });

  it("refuses a blank contact name", async () => {
    const [gesture] = await newGestures(1, "contact");
    const id = gesture?.id as number;

    const response = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), contactFullName: "" },
      [id]
    );

    expect(destination(response)).toBe(
      `/nl/sponsor/details?error=contact&gestures=${id}`
    );
  });

  it("accepts a logo upload into media, and refuses a non-image", async () => {
    const [gesture] = await newGestures(1, "logo");
    const id = gesture?.id as number;

    const accepted = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      [id],
      new File([PIXEL], "acme.gif", { type: "image/png" })
    );
    const refused = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      [id],
      new File(["<script>"], "acme.html", { type: "text/html" })
    );
    const missing = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      [id]
    );

    expect(destination(accepted)).toBe("/nl/sponsor/preview");
    expect(destination(refused)).toBe(
      `/nl/sponsor/details?error=logo-type&gestures=${id}`
    );
    expect(destination(missing)).toBe(
      `/nl/sponsor/details?error=logo&gestures=${id}`
    );

    // The row really landed in `media`, with an alt text and a filename this
    // app chose rather than the browser's.
    const mediaId = draftFrom(accepted)?.logoMediaId;

    expect(mediaId).toBeTruthy();

    const media = await payload.findByID({
      collection: "media",
      id: mediaId as string,
      overrideAccess: true,
    });

    expect(media.alt).toBe("Logo van Acme");
    expect(media.filename).toMatch(/^sponsor-logo-[0-9a-f-]+\.png$/);
    expect(media.filename).not.toContain("acme.gif");
  });

  it("stores no logo when the sponsor did not ask for one", async () => {
    // `hasLogo` records whether the option was *paid* for, and
    // `lib/sponsorOverlay.ts` gates the public overlay on exactly that pair.
    // A file posted beside an unticked box must not be stored, or an editor
    // approving the sponsorship sees an image the sponsor did not buy.
    const [gesture] = await newGestures(1, "no-logo");
    const before = await payload.count({
      collection: "media",
      overrideAccess: true,
    });

    const response = await multipartDetails(
      goodDetails(),
      [gesture?.id as number],
      new File([PIXEL], "sneaky.png", { type: "image/png" })
    );

    const after = await payload.count({
      collection: "media",
      overrideAccess: true,
    });

    expect(destination(response)).toBe("/nl/sponsor/preview");
    expect(draftFrom(response)?.logoMediaId).toBeNull();
    expect(after.totalDocs).toBe(before.totalDocs);
  });

  it("bounds the logo file size", async () => {
    const [gesture] = await newGestures(1, "logo-size");
    const id = gesture?.id as number;
    const before = await payload.count({
      collection: "media",
      overrideAccess: true,
    });

    const response = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      [id],
      // One byte over. A PNG header so nothing but the size can refuse it —
      // an oversized file of the wrong type would be caught by the type check
      // and this test would pass without the bound existing.
      new File([new Uint8Array(MAX_LOGO_BYTES + 1)], "huge.png", {
        type: "image/png",
      })
    );

    const after = await payload.count({
      collection: "media",
      overrideAccess: true,
    });

    expect(destination(response)).toBe(
      `/nl/sponsor/details?error=logo-size&gestures=${id}`
    );
    // And nothing reached R2 — the check runs before the upload, which is the
    // only ordering that makes a size limit a limit.
    expect(after.totalDocs).toBe(before.totalDocs);
  });

  it("stores the VAT number only when an invoice was requested", async () => {
    const gestures = await newGestures(2, "vat");
    const withInvoice = gestures[0]?.id as number;
    const without = gestures[1]?.id as number;

    const invoiced = await formPost(
      DETAILS_PATH,
      {
        ...goodDetails(),
        invoiceEmail: "facturen@example.com",
        invoiceName: "Acme BV",
        invoiceRequested: "on",
        // A real ondernemingsnummer: 97 - (12345674 % 97) === 49.
        invoiceVatNumber: "0123456749",
      },
      [withInvoice]
    );

    // The same three fields, posted with the box unticked. They must not be
    // stored: a VAT number is identifying data with no purpose left once the
    // sponsor changes their mind, and the shipped mutation drops it too.
    const uninvoiced = await formPost(
      DETAILS_PATH,
      {
        ...goodDetails(),
        invoiceEmail: "facturen@example.com",
        invoiceName: "Acme BV",
        invoiceVatNumber: "0123456749",
      },
      [without]
    );

    expect(destination(invoiced)).toBe("/nl/sponsor/preview");
    expect(destination(uninvoiced)).toBe("/nl/sponsor/preview");
    expect(draftFrom(invoiced)?.invoiceVatNumber).toBe("0123456749");
    expect(draftFrom(uninvoiced)?.invoiceVatNumber).toBe("");
    expect(draftFrom(uninvoiced)?.invoiceRequested).toBe(false);

    await checkoutFrom(invoiced, [withInvoice]);
    await checkoutFrom(uninvoiced, [without]);

    const [invoicedRow] = await rowsFor([withInvoice]);
    const [uninvoicedRow] = await rowsFor([without]);

    expect(invoicedRow?.invoiceVatNumber).toBe("0123456749");
    expect(invoicedRow?.invoiceRequested).toBe(true);
    expect(uninvoicedRow?.invoiceVatNumber).toBeNull();
    expect(uninvoicedRow?.invoiceRequested).toBe(false);
  });

  it("refuses an invoice whose ondernemingsnummer does not check out", async () => {
    // Ten digits, right shape, wrong modulo-97 check digits. The shipped
    // wizard validates this in `utils/-validation.ts`, and an invoice is a
    // legal document the accountant sends back.
    const [gesture] = await newGestures(1, "bad-vat");
    const id = gesture?.id as number;

    const response = await formPost(
      DETAILS_PATH,
      {
        ...goodDetails(),
        invoiceEmail: "facturen@example.com",
        invoiceName: "Acme BV",
        invoiceRequested: "on",
        invoiceVatNumber: "0123456700",
      },
      [id]
    );

    const incomplete = await formPost(
      DETAILS_PATH,
      { ...goodDetails(), invoiceRequested: "on" },
      [id]
    );

    expect(destination(response)).toBe(
      `/nl/sponsor/details?error=vat&gestures=${id}`
    );
    expect(destination(incomplete)).toBe(
      `/nl/sponsor/details?error=invoice&gestures=${id}`
    );
  });

  it("creates one sponsorship row per selected gesture", async () => {
    const gestures = await newGestures(3, "bulk");
    const ids = gestures.map((gesture) => gesture.id);

    const response = await formPost(CHECKOUT_PATH, goodDetails(), ids);
    const rows = await rowsFor(ids);

    expect(response.status).toBe(303);
    expect(rows).toHaveLength(3);
    expect(
      rows.map((row) => Number(row.gesture)).sort((a, b) => a - b)
    ).toEqual([...ids].sort((a, b) => a - b));
    // Every row carries the whole order's details, and the overlay text is
    // the sponsor name — one input, two columns, as the product has it.
    for (const row of rows) {
      expect(row.sponsorName).toBe("Acme");
      expect(row.overlayText).toBe("Acme");
      expect(row.sponsorEmail).toBe("jan@example.com");
      expect(row.contactFullName).toBe("Jan Janssens");
    }
  });

  it("creates them all in pending_payment", async () => {
    const gestures = await newGestures(2, "pending");
    const ids = gestures.map((gesture) => gesture.id);

    await formPost(CHECKOUT_PATH, goodDetails(), ids);

    const rows = await rowsFor(ids);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual([
      "pending_payment",
      "pending_payment",
    ]);
    // Never straight to `active`, and never to the approval queue: the
    // webhook is the only thing that moves a sponsorship out of
    // `pending_payment`, and approval is a person after that.
    expect(rows.every((row) => row.status !== "active")).toBe(true);
  });

  it("prices each row per gesture, not per order", async () => {
    /*
     * `endpoints/mollie.ts` sums `paymentAmount` across a payment's
     * sponsorships and compares the sum with what Mollie charged. Writing the
     * order total on each row would make a three-gesture order look like it
     * cost three times what it did, and the webhook would refuse a payment
     * the sponsor had already made. The shipped `createBulkSimplified` writes
     * the per-gesture amount for the same reason.
     */
    const gestures = await newGestures(3, "price");
    const ids = gestures.map((gesture) => gesture.id);

    // Through the real step 2 first, because the logo option is priced and a
    // logo has to exist to be priced: `checkout` refuses `wantsLogo` with no
    // uploaded file, exactly as the shipped wizard's own validation does.
    const details = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      ids,
      new File([PIXEL], "acme.png", { type: "image/png" })
    );

    await checkoutFrom(details, ids);

    const rows = await rowsFor(ids);
    const perGesture = sponsorshipAmountCents(1, true);

    expect(rows.map((row) => row.paymentAmount)).toEqual([
      perGesture,
      perGesture,
      perGesture,
    ]);
    expect(rows.reduce((total, row) => total + row.paymentAmount, 0)).toBe(
      sponsorshipAmountCents(3, true)
    );
    expect(mollieCalls[0]?.body.amount).toEqual({
      currency: "EUR",
      value: (sponsorshipAmountCents(3, true) / 100).toFixed(2),
    });
    expect(rows.every((row) => row.hasLogo === true)).toBe(true);
  });

  it("puts every created id in the Mollie payment's metadata", async () => {
    const gestures = await newGestures(3, "metadata");
    const ids = gestures.map((gesture) => gesture.id);

    await formPost(CHECKOUT_PATH, goodDetails(), ids);

    const rows = await rowsFor(ids);
    const metadata = mollieCalls[0]?.body.metadata as
      | { sponsorshipIds?: string }
      | undefined;

    expect(mollieCalls).toHaveLength(1);
    // The only thing that lets the webhook work out what a payment paid for.
    // All three, not the first — a payment naming one of three rows leaves
    // two paid-for sponsorships stuck in `pending_payment` for ever.
    expect(JSON.parse(metadata?.sponsorshipIds ?? "[]")).toEqual(
      rows.map((row) => String(row.id))
    );
  });

  it("writes one payment id onto every sponsorship in the order", async () => {
    /*
     * **The unique constraint this task drops, asserted end to end.** Stage 1
     * made `molliePaymentId` unique; `apps/server/src/webhooks/mollie.ts`
     * writes the same id to every sponsorship in a bulk payment and
     * `packages/convex/convex/schema.ts` declares a plain index, so the
     * constraint made the shipped purchase impossible. Under it, the second
     * row here was refused by D1 and the sponsor paid for three gestures
     * while one of them carried the payment.
     */
    const gestures = await newGestures(3, "payment-id");
    const ids = gestures.map((gesture) => gesture.id);
    const paymentId = `tr_shared_${crypto.randomUUID().slice(0, 8)}`;

    mollieAnswer = paymentAccepted(paymentId);

    await formPost(CHECKOUT_PATH, goodDetails(), ids);

    const rows = await rowsFor(ids);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.molliePaymentId)).toEqual([
      paymentId,
      paymentId,
      paymentId,
    ]);
  });

  it("sends the sponsor to Mollie's checkout URL", async () => {
    const gestures = await newGestures(1, "checkout-url");
    const ids = gestures.map((gesture) => gesture.id);
    const paymentId = `tr_url_${crypto.randomUUID().slice(0, 8)}`;

    mollieAnswer = paymentAccepted(paymentId);

    const response = await formPost(CHECKOUT_PATH, goodDetails(), ids);

    expect(response.status).toBe(303);
    expect(destination(response)).toBe(
      `https://www.mollie.com/checkout/${paymentId}`
    );
    expect(mollieCalls[0]?.body.redirectUrl).toBe(`${SITE}/nl/sponsor/success`);
  });

  it("asks for a render of every gesture it just sold", async () => {
    /*
     * **The Stage 6 seam at the other end.** `lib/renderJob.ts` cannot submit
     * anything — there is no deployed Remotion Lambda, and the plan forbids
     * this task from creating one — so what checkout can be held to today is
     * that it *asks*, once per sponsorship it created, and that the gap is
     * recorded rather than silent. A checkout that quietly submitted nothing
     * would leave a sponsor waiting for a composite nobody ever requested,
     * with nothing in any log to find.
     *
     * The log line is the only observable the empty seam has, which is the
     * point: when Task 6 fills it, this assertion is what has to change, the
     * same way `renderPreview.test.ts` had to change here.
     */
    const gestures = await newGestures(2, "render-ask");
    const ids = gestures.map((gesture) => gesture.id);
    const info = vi.spyOn(payload.logger, "info");

    let response: Response;
    let logged: string[] = [];

    try {
      response = await formPost(CHECKOUT_PATH, goodDetails(), ids);
    } finally {
      // Read before restoring: `mockRestore` clears the recorded calls as well
      // as putting the original method back, so a `finally` that restored first
      // would leave every assertion below comparing empty lists.
      logged = info.mock.calls.map((call) => String(call[0]));
      info.mockRestore();
    }

    // The sale completed: the ask is after the payment, and cannot break it.
    expect(response.status).toBe(303);
    expect(destination(response)).toContain("https://www.mollie.com/checkout/");

    const rows = await rowsFor(ids);
    const asked = logged.filter((line) => line.includes("[renderJob]"));

    expect(rows).toHaveLength(2);
    // One per sponsorship, naming it, so an operator can tell which of a
    // three-gesture order has no video coming.
    expect(asked).toHaveLength(2);

    for (const row of rows) {
      expect(asked.some((line) => line.includes(`sponsorship ${row.id}`))).toBe(
        true
      );
    }

    // And no render row was claimed, because no render was submitted. A
    // `queued` row for a job nobody sent is a lie the callback would later
    // have to answer to.
    const { totalDocs } = await payload.find({
      collection: "renders",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { sponsorship: { in: rows.map((row) => row.id) } },
    });

    expect(totalDocs).toBe(0);
  });

  it("completes the checkout even when the render submission throws", async () => {
    /*
     * The sponsor has an open Mollie payment by the time a render is asked
     * for. A video pipeline that is misconfigured — here: a Lambda named but
     * no Mux signing key, which is exactly the half-finished state Task 6 will
     * pass through — must not be able to turn a completed purchase into an
     * error page.
     *
     * The failure is priced so only the `catch` can absorb it: the three
     * `REMOTION_*` variables are set, so the seam gets past its "not
     * configured" branch and into building the submission, where the missing
     * signing key throws.
     */
    process.env.REMOTION_FUNCTION_NAME = "remotion-render-for-tests-only";
    process.env.REMOTION_REGION = "eu-central-1";
    process.env.REMOTION_SERVE_URL = "https://example.invalid/sites/smog";

    const gestures = await newGestures(1, "render-throws");
    const ids = gestures.map((gesture) => gesture.id);
    const errors = vi.spyOn(payload.logger, "error");

    let response: Response;
    let logged: string[] = [];

    try {
      response = await formPost(CHECKOUT_PATH, goodDetails(), ids);
    } finally {
      logged = errors.mock.calls.map((call) => JSON.stringify(call));
      errors.mockRestore();
      restoreEnv("REMOTION_FUNCTION_NAME", undefined);
      restoreEnv("REMOTION_REGION", undefined);
      restoreEnv("REMOTION_SERVE_URL", undefined);
    }

    expect(response.status).toBe(303);
    expect(destination(response)).toContain("https://www.mollie.com/checkout/");
    expect(await rowsFor(ids)).toHaveLength(1);

    // And it is recorded rather than swallowed: a sponsorship that is paid for
    // and has no video coming is something an operator has to be able to find.
    expect(
      logged.filter((line) => line.includes("No render could be submitted"))
    ).toHaveLength(1);
  });

  it("does not create rows when Mollie refuses the payment — it leaves them for cleanup-stale-payments", async () => {
    /*
     * **The name is the plan's; the assertion is what the plan's own comment
     * asks for**, and the two disagree. There are no transactions, and the
     * payment's metadata has to name the rows, so the rows are necessarily
     * written first. What is asserted is therefore the *recovery*: they exist,
     * in `pending_payment`, with no `molliePaymentId` — which is exactly the
     * shape Stage 7's `cleanup-stale-payments` collects. Deleting them on this
     * path would be a second multi-step write with no transaction behind it
     * either, and a half-done delete leaves rows worse than these.
     */
    const gestures = await newGestures(2, "refused");
    const ids = gestures.map((gesture) => gesture.id);

    mollieAnswer = paymentRefused();

    const response = await formPost(CHECKOUT_PATH, goodDetails(), ids);
    const rows = await rowsFor(ids);

    expect(destination(response)).toBe("/nl/sponsor/preview?error=payment");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual([
      "pending_payment",
      "pending_payment",
    ]);
    expect(rows.map((row) => row.molliePaymentId)).toEqual([null, null]);
  });

  it("gives Mollie a webhook URL for a public origin and none for a local one", async () => {
    /*
     * Mollie refuses a `webhookUrl` it cannot reach, and refuses the whole
     * payment with it — so a developer on `localhost` would get no checkout
     * at all. The shipped flow makes the same exception. The URL is the
     * rewrite source, which is what Mollie posts back to for weeks.
     */
    const local = await newGestures(1, "webhook-local");
    const remote = await newGestures(1, "webhook-remote");
    const PUBLIC_SITE = "https://sponsor.example";

    await formPost(
      CHECKOUT_PATH,
      goodDetails(),
      local.map((gesture) => gesture.id)
    );

    expect(mollieCalls[0]?.body.webhookUrl).toBeUndefined();

    mollieCalls = [];
    mollieAnswer = paymentAccepted("tr_public");

    await formPost(
      CHECKOUT_PATH,
      goodDetails(),
      remote.map((gesture) => gesture.id),
      { site: PUBLIC_SITE }
    );

    expect(mollieCalls[0]?.body.webhookUrl).toBe(
      `${PUBLIC_SITE}/webhooks/mollie`
    );
    expect(mollieCalls[0]?.body.redirectUrl).toBe(
      `${PUBLIC_SITE}/nl/sponsor/success`
    );
  });

  it("gives every row a term of one year from now", async () => {
    const gestures = await newGestures(1, "term");
    const ids = gestures.map((gesture) => gesture.id);
    const before = Date.now();

    await formPost(CHECKOUT_PATH, goodDetails(), ids);

    const [row] = await rowsFor(ids);
    const started = new Date(row?.startDate as string).getTime();
    const ends = new Date(row?.endDate as string).getTime();

    expect(row?.durationYears).toBe(1);
    expect(started).toBeGreaterThanOrEqual(before - 1000);
    expect(ends - started).toBe(365 * 24 * 60 * 60 * 1000);
    /*
     * `startDate` is now and not the shipped mutation's `0`. That column is
     * `required` here and nothing in this app fills it in later, so a
     * sentinel would make every sponsorship fail `lib/sponsorOverlay.ts`'s
     * in-term test for ever — the overlay would never render.
     */
    expect(started).toBeLessThanOrEqual(Date.now());
  });

  it("copies the gesture's own playback id onto the sponsorship", async () => {
    // `originalVideoPlaybackId` is what the preview step plays in this stage
    // (`lib/renderPreview.ts`) and what Stage 6 has to put back when a term
    // ends. It is required, so a gesture with no video cannot be sponsored at
    // all — which `gestures.playbackId` being `required: true` already makes
    // impossible.
    const gestures = await newGestures(1, "playback");
    const ids = gestures.map((gesture) => gesture.id);

    await formPost(CHECKOUT_PATH, goodDetails(), ids);

    const [row] = await rowsFor(ids);

    expect(row?.originalVideoPlaybackId).toBe(gestures[0]?.playbackId);
  });

  it("re-checks the selection at checkout, after step 2 has been and gone", async () => {
    /*
     * Minutes pass between step 2 and step 3, and the draft cookie is not
     * signed. This is the check that makes the wizard's earlier screens a
     * courtesy rather than the thing standing between two sponsors and one
     * gesture.
     */
    const gestures = await newGestures(1, "stale");
    const id = gestures[0]?.id as number;

    // Somebody else buys it in between.
    await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: "Iemand anders",
        durationYears: 1,
        endDate: new Date(Date.now() + 300 * DAY).toISOString(),
        gesture: id,
        originalVideoPlaybackId: "pb-someone-else",
        overlayText: "Iemand anders",
        paymentAmount: 5000,
        sponsorEmail: `first-${crypto.randomUUID()}@example.com`,
        sponsorName: "Iemand anders",
        startDate: new Date().toISOString(),
        status: "pending_payment",
      },
    });

    const before = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    const response = await formPost(CHECKOUT_PATH, goodDetails(), [id]);

    const after = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    expect(destination(response)).toBe("/nl/sponsor?error=sold");
    expect(after.totalDocs).toBe(before.totalDocs);
    expect(mollieCalls).toEqual([]);
  });

  it("refuses a logo id that names no media row", async () => {
    /*
     * The id arrives in a hidden field, so it is a number a stranger can
     * type, and `overlayImage` carries a real foreign key — without the
     * lookup this is an unhandled `DrizzleQueryError`, a 500 with a JSON body
     * in a browser window, on a page whose every other refusal is a sentence.
     */
    const gestures = await newGestures(1, "bad-logo");
    const id = gestures[0]?.id as number;
    const before = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    const response = await formPost(
      CHECKOUT_PATH,
      { ...goodDetails(), logoMediaId: "999000001", wantsLogo: "on" },
      [id]
    );

    const after = await payload.count({
      collection: "sponsorships",
      overrideAccess: true,
    });

    expect(destination(response)).toBe(
      `/nl/sponsor/details?error=logo&gestures=${id}`
    );
    expect(after.totalDocs).toBe(before.totalDocs);
  });

  it("carries the uploaded logo all the way onto the sponsorship", async () => {
    const gestures = await newGestures(1, "logo-end-to-end");
    const id = gestures[0]?.id as number;

    const details = await multipartDetails(
      { ...goodDetails(), wantsLogo: "on" },
      [id],
      new File([PIXEL], "acme.png", { type: "image/png" })
    );

    const mediaId = draftFrom(details)?.logoMediaId as string;

    await formPost(
      CHECKOUT_PATH,
      { ...goodDetails(), logoMediaId: mediaId, wantsLogo: "on" },
      [id]
    );

    const [row] = await rowsFor([id]);

    expect(row?.hasLogo).toBe(true);
    expect(String(row?.overlayImage)).toBe(mediaId);
  });

  it("refuses a checkout for a gesture that does not exist", async () => {
    const response = await formPost(
      CHECKOUT_PATH,
      goodDetails(),
      [999_000_002]
    );

    expect(destination(response)).toBe("/nl/sponsor?error=gesture");
    expect(mollieCalls).toEqual([]);
  });

  /** Step 3, posted with the details step 2 put in its draft cookie. */
  const checkoutFrom = async (
    detailsResponse: Response,
    gestureIds: number[]
  ) => {
    const draft = draftFrom(detailsResponse);

    if (draft === null) {
      throw new Error("step 2 set no draft cookie");
    }

    const fields: Record<string, string> = {
      contactCompany: draft.contactCompany,
      contactFullName: draft.contactFullName,
      locale: "nl",
      sponsorEmail: draft.sponsorEmail,
      sponsorName: draft.sponsorName,
    };

    if (draft.wantsLogo) {
      fields.wantsLogo = "on";
    }

    if (draft.logoMediaId !== null) {
      fields.logoMediaId = draft.logoMediaId;
    }

    if (draft.invoiceRequested) {
      fields.invoiceRequested = "on";
      fields.invoiceName = draft.invoiceName;
      fields.invoiceVatNumber = draft.invoiceVatNumber;
      fields.invoiceEmail = draft.invoiceEmail;
    }

    return await formPost(CHECKOUT_PATH, fields, gestureIds);
  };
});

/**
 * `POST /api/sponsor/re-edit` — the sponsor's one write after paying.
 *
 * Driven through `handleEndpoints` rather than by calling the handler, for
 * the reason the two describes above give: half of what can go wrong is
 * routing, and a handler called with a hand-built `req` passes whatever path
 * it is mounted at. The token is the only authorisation on this surface, so
 * every refusal below is asserted twice — the answer the sponsor gets, and
 * the row not having moved.
 */
describe("the sponsor wizard, the re-edit link", () => {
  const RUN_RE_EDIT = crypto.randomUUID();
  const RE_EDIT_PATH = "/api/sponsor/re-edit";
  const YEAR = 365 * DAY;

  /** A one-by-one transparent GIF, small enough to post in a test. */
  const PIXEL_RE_EDIT = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: number;

  const sponsorship = async (overrides: Record<string, unknown> = {}) =>
    await payload.create({
      collection: "sponsorships",
      data: {
        contactFullName: `Jan Janssens ${RUN_RE_EDIT}`,
        durationYears: 1,
        endDate: new Date(Date.now() + YEAR).toISOString(),
        gesture: gestureId,
        originalVideoPlaybackId: `pb-re-edit-${RUN_RE_EDIT}`,
        overlayText: `Met dank aan Acme ${RUN_RE_EDIT}`,
        paymentAmount: 5000,
        sponsorEmail: `re-edit-${crypto.randomUUID()}@example.com`,
        sponsorName: `Acme ${RUN_RE_EDIT}`,
        startDate: new Date().toISOString(),
        status: "pending_resubmission",
        ...overrides,
      },
      overrideAccess: true,
    });

  /** A sponsorship waiting to be re-edited, and the link that reaches it. */
  const awaitingReEdit = async (overrides: Record<string, unknown> = {}) => {
    const token = crypto.randomUUID();
    const row = await sponsorship({
      reEditToken: token,
      reEditTokenExpiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
      ...overrides,
    });

    return { id: row.id, token };
  };

  /** The raw row, hidden columns and all, as only server-side code reads it. */
  const raw = async (id: number) =>
    await payload.findByID({
      collection: "sponsorships",
      depth: 0,
      id,
      overrideAccess: true,
      showHiddenFields: true,
    });

  /** The re-edit form, as the page renders it: multipart, because of the logo. */
  const submit = (
    fields: Record<string, string>,
    init: { logo?: File; origin?: null | string } = {}
  ) => {
    const body = new FormData();

    for (const [name, value] of Object.entries(fields)) {
      body.append(name, value);
    }

    if (init.logo !== undefined) {
      body.append("logo", init.logo);
    }

    const headers = new Headers();

    if (init.origin !== null) {
      headers.set("Origin", init.origin ?? SITE);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}${RE_EDIT_PATH}`, {
        body,
        headers,
        method: "POST",
      }),
    });
  };

  const landing = (response: Response) => response.headers.get("Location");

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Herwerken ${RUN_RE_EDIT}` },
      locale: "nl",
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Herwerken ${RUN_RE_EDIT}`,
        playbackId: `pb-re-edit-${RUN_RE_EDIT}`,
      },
      locale: "nl",
    });
    gestureId = gesture.id;
  });

  it("boots with the fixtures this file assumes", async () => {
    // `beforeAll` throwing is reported as *skipped*, not failed, so a run
    // that seeded nothing would look green.
    const { id, token } = await awaitingReEdit();
    const row = await raw(id);

    expect(row.status).toBe("pending_resubmission");
    expect(row.reEditToken).toBe(token);
  });

  it("moves pending_resubmission back to pending_approval on submit", async () => {
    const { id, token } = await awaitingReEdit();

    const response = await submit({
      locale: "nl",
      // Short on purpose: the cap is 35 characters, and a name built out of
      // this file's run id would be refused for a reason this test is not
      // about.
      sponsorName: "Acme herwerkt",
      token,
    });

    expect(response.status).toBe(303);
    expect(landing(response)).toBe("/nl/sponsor/re-edit?notice=sent");

    const row = await raw(id);

    expect(row.status).toBe("pending_approval");
    expect(row.sponsorName).toBe("Acme herwerkt");
    // One input, two columns, exactly as step 2 writes them.
    expect(row.overlayText).toBe("Acme herwerkt");
  });

  it("destroys the token it was used with", async () => {
    const { id, token } = await awaitingReEdit();

    await submit({ locale: "nl", sponsorName: "Acme", token });

    const row = await raw(id);

    expect(row.reEditToken).toBeNull();
    expect(row.reEditTokenExpiresAt).toBeNull();
  });

  it("refuses a token that has already been used, and changes nothing", async () => {
    const { id, token } = await awaitingReEdit();

    await submit({ locale: "nl", sponsorName: "Eerste", token });

    const response = await submit({
      locale: "nl",
      sponsorName: "Tweede",
      token,
    });

    expect(landing(response)).toBe("/nl/sponsor/re-edit");
    expect((await raw(id)).sponsorName).toBe("Eerste");
  });

  it("refuses an expired token, and accepted the same one before it expired", async () => {
    const { id, token } = await awaitingReEdit();

    // The positive case first, on the same token and the same row, so the
    // refusal below cannot be a token that never matched anything.
    const accepted = await submit({
      locale: "nl",
      sponsorName: "Op tijd",
      token,
    });

    expect(landing(accepted)).toBe("/nl/sponsor/re-edit?notice=sent");

    // Put the row back where it was, with the same token, expired.
    await payload.update({
      collection: "sponsorships",
      data: { status: "pending_resubmission" },
      id,
      overrideAccess: true,
    });
    await payload.update({
      collection: "sponsorships",
      data: {
        reEditToken: token,
        reEditTokenExpiresAt: new Date(Date.now() - DAY).toISOString(),
      },
      id,
      overrideAccess: true,
    });

    const refused = await submit({
      locale: "nl",
      sponsorName: "Te laat",
      token,
    });

    expect(landing(refused)).toBe("/nl/sponsor/re-edit");
    expect((await raw(id)).sponsorName).toBe("Op tijd");
  });

  it("refuses a token on a sponsorship that is not awaiting a resubmission", async () => {
    // A live token on another status is a row that was *created* holding one
    // — an admin, or Stage 9's import — rather than one this flow produced.
    // Without the status check it would push a rejected sponsorship into the
    // approval queue without anybody asking for a resubmission.
    const { id, token } = await awaitingReEdit({ status: "rejected" });

    const response = await submit({
      locale: "nl",
      sponsorName: "Toch maar",
      token,
    });

    expect(landing(response)).toBe("/nl/sponsor/re-edit");
    expect((await raw(id)).status).toBe("rejected");
  });

  it("refuses a token nobody minted", async () => {
    const response = await submit({
      locale: "nl",
      sponsorName: "Acme",
      token: crypto.randomUUID(),
    });

    expect(landing(response)).toBe("/nl/sponsor/re-edit");
  });

  it("refuses a post with no token at all without touching a tokenless row", async () => {
    // The tokenless guard, reached through the endpoint rather than through
    // the access rule directly: `{ equals: undefined }` would match every
    // row whose token is NULL, and this one is such a row.
    const row = await sponsorship({ status: "pending_approval" });

    const response = await submit({ locale: "nl", sponsorName: "Acme" });

    expect(landing(response)).toBe("/nl/sponsor/re-edit");
    expect((await raw(row.id)).sponsorName).toBe(`Acme ${RUN_RE_EDIT}`);
  });

  it("refuses a blank sponsor name and keeps the link alive", async () => {
    const { id, token } = await awaitingReEdit();

    const response = await submit({ locale: "nl", sponsorName: "   ", token });

    expect(landing(response)).toBe(
      `/nl/sponsor/re-edit?error=name&token=${token}`
    );

    const row = await raw(id);

    expect(row.status).toBe("pending_resubmission");
    expect(row.reEditToken).toBe(token);
  });

  it("refuses a sponsor name longer than the wizard's own cap", async () => {
    const { id, token } = await awaitingReEdit();

    const response = await submit({
      locale: "nl",
      sponsorName: "x".repeat(36),
      token,
    });

    expect(landing(response)).toBe(
      `/nl/sponsor/re-edit?error=name&token=${token}`
    );
    expect((await raw(id)).status).toBe("pending_resubmission");
  });

  it("refuses a cross-site post outright", async () => {
    const { id, token } = await awaitingReEdit();

    const response = await submit(
      { locale: "nl", sponsorName: "Gekaapt", token },
      { origin: "https://evil.example" }
    );

    expect(response.status).toBe(403);
    expect((await raw(id)).status).toBe("pending_resubmission");
  });

  it("does not let the form choose the status", async () => {
    // The endpoint writes a closed set of fields, so a posted `status` is
    // not a field at all — it is an unknown form key.
    const { id, token } = await awaitingReEdit();

    await submit({
      locale: "nl",
      sponsorName: "Acme",
      status: "active",
      token,
    });

    expect((await raw(id)).status).toBe("pending_approval");
  });

  it("does not let the form choose the payment amount", async () => {
    const { id, token } = await awaitingReEdit();

    await submit({
      locale: "nl",
      paymentAmount: "1",
      sponsorName: "Acme",
      token,
    });

    expect((await raw(id)).paymentAmount).toBe(5000);
  });

  it("replaces the logo of a sponsorship that paid for one", async () => {
    const { id, token } = await awaitingReEdit({ hasLogo: true });

    await submit(
      { locale: "nl", sponsorName: "Acme", token },
      { logo: new File([PIXEL_RE_EDIT], "nieuw.png", { type: "image/png" }) }
    );

    const row = await raw(id);

    expect(row.status).toBe("pending_approval");
    expect(row.overlayImage).not.toBeNull();
  });

  it("ignores a logo posted for a sponsorship that did not pay for one", async () => {
    // `hasLogo` records what was *bought*, and `lib/sponsorOverlay.ts` gates
    // the public overlay on exactly that pair — so storing the file would buy
    // an unauthenticated upload and show nothing.
    const { id, token } = await awaitingReEdit({ hasLogo: false });

    const response = await submit(
      { locale: "nl", sponsorName: "Acme", token },
      { logo: new File([PIXEL_RE_EDIT], "gratis.png", { type: "image/png" }) }
    );

    const row = await raw(id);

    // The submission still went through — this is a dropped file, not a
    // refused request.
    expect(landing(response)).toBe("/nl/sponsor/re-edit?notice=sent");
    expect(row.status).toBe("pending_approval");
    expect(row.overlayImage ?? null).toBeNull();
  });

  it("refuses a replacement logo that is not an image type", async () => {
    const { id, token } = await awaitingReEdit({ hasLogo: true });

    const response = await submit(
      { locale: "nl", sponsorName: "Acme", token },
      { logo: new File(["<script>"], "acme.html", { type: "text/html" }) }
    );

    expect(landing(response)).toBe(
      `/nl/sponsor/re-edit?error=logo-type&token=${token}`
    );
    expect((await raw(id)).status).toBe("pending_resubmission");
  });

  it("refuses a replacement logo bigger than a logo may be", async () => {
    const { id, token } = await awaitingReEdit({ hasLogo: true });

    const response = await submit(
      { locale: "nl", sponsorName: "Acme", token },
      {
        logo: new File([new Uint8Array(MAX_LOGO_BYTES + 1)], "huge.png", {
          type: "image/png",
        }),
      }
    );

    expect(landing(response)).toBe(
      `/nl/sponsor/re-edit?error=logo-size&token=${token}`
    );
    expect((await raw(id)).status).toBe("pending_resubmission");
  });

  it("keeps the logo a sponsor did not replace", async () => {
    const { id, token } = await awaitingReEdit({ hasLogo: true });

    const media = await payload.create({
      collection: "media",
      data: { alt: `Logo ${RUN_RE_EDIT}` },
      file: {
        data: PIXEL_RE_EDIT,
        mimetype: "image/png",
        name: `re-edit-bestaand-${crypto.randomUUID()}.png`,
        size: PIXEL_RE_EDIT.byteLength,
      },
      overrideAccess: true,
    });

    await payload.update({
      collection: "sponsorships",
      data: { overlayImage: media.id },
      id,
      overrideAccess: true,
    });

    await submit({ locale: "nl", sponsorName: "Acme", token });

    expect((await raw(id)).overlayImage).toBe(media.id);
  });

  it("files the transition in admin-logs like every other one", async () => {
    const { id, token } = await awaitingReEdit();

    await submit({ locale: "nl", sponsorName: "Acme", token });

    const { docs } = await payload.find({
      collection: "admin-logs",
      overrideAccess: true,
      where: {
        and: [
          { targetId: { equals: String(id) } },
          { action: { equals: "sponsorship.status_changed" } },
        ],
      },
    });

    expect(docs.map((doc) => doc.metadata)).toContainEqual({
      from: "pending_resubmission",
      to: "pending_approval",
    });
  });
});
