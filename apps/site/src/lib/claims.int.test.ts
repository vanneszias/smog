// @vitest-environment node
import { Forbidden, getPayload } from "payload";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CLAIM_KINDS, releaseClaim, takeClaim } from "@/lib/claims";
import config from "../payload.config";

/*
 * Unique per run: the local D1 under `.wrangler/state/vitest` is never cleared
 * between runs, and a collision on `claims.key` — which is exactly what this
 * file is about — would throw inside a test rather than proving anything.
 */
const RUN = crypto.randomUUID();

/** A key no other test in this file, or any other, uses. */
const keyFor = (label: string) => `${label}-${RUN}`;

const MINUTE = 60 * 1000;

/**
 * The one `claims` table, driven through the two operations every consumer
 * uses.
 *
 * `endpoints/mollie.int.test.ts` and `endpoints/render.int.test.ts` prove the
 * behaviour their handlers must keep; this file proves the properties of the
 * table itself, which those two cannot see — that a key is namespaced, that a
 * receipt outlives a lease, and that a lost race is told apart from an outage.
 */
describe("the claims table", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  // Stand-in principals, as `AdminLogs.int.test.ts` uses them: the access
  // functions read `user.role` and nothing else, so no row has to exist.
  const admin = { id: 1, role: "admin", collection: "users" };
  const regularUser = { id: 2, role: "user", collection: "users" };

  const rowFor = async (key: string) => {
    const { docs } = await payload.find({
      collection: "claims",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: key } },
    });

    return docs[0] ?? null;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serialises a Mollie webhook replay exactly as before", async () => {
    // Stage 5's guarantee, through the table that replaced its own. Both
    // deliveries insert; with no transactions the unique index inside the
    // INSERT is the only thing that can decide between them.
    const key = keyFor("tr_replay");
    const claim = { key, kind: CLAIM_KINDS.mollieDelivery } as const;

    const results = await Promise.all([
      takeClaim(payload, claim),
      takeClaim(payload, claim),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    // And a third, sequential attempt is still refused: the claim is a
    // receipt, kept for ever, not a lease that quietly lapses.
    expect(await takeClaim(payload, claim)).toBe(false);
    expect((await rowFor(`mollie-delivery:${key}`))?.expiresAt ?? null).toBe(
      null
    );
  });

  it("serialises a render callback replay exactly as before", async () => {
    // Stage 6's guarantee, through the same table. The thing being serialised
    // is `POST https://api.mux.com/video/v1/assets`: two callbacks that both
    // get past this claim create two Mux assets for one render, and the one
    // nothing points at is a bill that arrives every month for ever.
    const key = keyFor("render-replay");
    const claim = { key, kind: CLAIM_KINDS.renderCompletion } as const;

    const results = await Promise.all([
      takeClaim(payload, claim),
      takeClaim(payload, claim),
      takeClaim(payload, claim),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await takeClaim(payload, claim)).toBe(false);
  });

  it("keeps two consumers with the same key from colliding", async () => {
    // One table, many kinds. A payment id and a render job id are both opaque
    // strings somebody else chose; if they can ever be equal, one consumer
    // would find the other's claim already taken and skip work it was the only
    // party able to do.
    const key = keyFor("shared-identifier");

    expect(
      await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery })
    ).toBe(true);
    expect(
      await takeClaim(payload, { key, kind: CLAIM_KINDS.renderCompletion })
    ).toBe(true);
    expect(await takeClaim(payload, { key, kind: CLAIM_KINDS.jobRun })).toBe(
      true
    );

    // The positive beside the three: they are three distinct rows, under three
    // distinct keys, each carrying its own kind, and each still refuses its own
    // second attempt. `kind` is denormalised out of the key rather than load-
    // bearing, but it is what the admin list reads and what this migration's
    // own `down` filters on to put the receipts back in the right table.
    expect(await rowFor(`mollie-delivery:${key}`)).toMatchObject({
      kind: "mollie-delivery",
    });
    expect(await rowFor(`render-completion:${key}`)).toMatchObject({
      kind: "render-completion",
    });
    expect(await rowFor(`job-run:${key}`)).toMatchObject({ kind: "job-run" });
    expect(
      await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery })
    ).toBe(false);
  });

  it("gives the claim back when it is released", async () => {
    // A claim is only safe to keep because it is handed back whenever the work
    // did not complete. Without this the table is a way to lose work rather
    // than a way to serialise it.
    const key = keyFor("released");
    const claim = { key, kind: CLAIM_KINDS.mollieDelivery } as const;

    expect(await takeClaim(payload, claim)).toBe(true);
    expect(await takeClaim(payload, claim)).toBe(false);

    await releaseClaim(payload, { ...claim, consequence: "unused" });

    expect(await rowFor(`mollie-delivery:${key}`)).toBeNull();
    expect(await takeClaim(payload, claim)).toBe(true);
  });

  it("releases only the claim it was asked for", async () => {
    /*
     * The release matches the whole namespaced key, and both halves of that
     * matter — a release scoped any wider deletes receipts for work that was
     * done, which for a render completion is a second Mux asset and a bill
     * every month.
     *
     * Two axes, because an earlier version of this test only had one: a claim
     * of a *different kind* on the same key, and a claim of the *same kind* on
     * a different key. Releasing by kind alone survived the first and would
     * have wiped every recorded Mollie delivery in the table.
     */
    const key = keyFor("release-scope");
    const sibling = keyFor("release-scope-sibling");

    await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery });
    await takeClaim(payload, {
      key: sibling,
      kind: CLAIM_KINDS.mollieDelivery,
    });
    await takeClaim(payload, { key, kind: CLAIM_KINDS.renderCompletion });

    await releaseClaim(payload, {
      consequence: "unused",
      key,
      kind: CLAIM_KINDS.mollieDelivery,
    });

    expect(await rowFor(`mollie-delivery:${key}`)).toBeNull();
    expect(await rowFor(`mollie-delivery:${sibling}`)).not.toBeNull();
    expect(await rowFor(`render-completion:${key}`)).not.toBeNull();
  });

  it("takes over a lease whose holder never came back", async () => {
    // The dead-worker case. A lease with no way to lapse is a job that never
    // runs again after one crash.
    const key = keyFor("dead-worker");
    const claim = { key, kind: CLAIM_KINDS.jobRun } as const;

    await payload.create({
      collection: "claims",
      data: {
        expiresAt: new Date(Date.now() - MINUTE).toISOString(),
        key: `job-run:${key}`,
        kind: CLAIM_KINDS.jobRun,
      },
      overrideAccess: true,
    });

    expect(await takeClaim(payload, { ...claim, ttlMs: MINUTE })).toBe(true);
  });

  it("leaves a lease that has not lapsed alone", async () => {
    // The negative beside the positive above: if an expired lease is taken
    // over by comparing nothing at all, two runners run at once and three of
    // the four jobs have irreversible effects.
    const key = keyFor("live-lease");
    const claim = { key, kind: CLAIM_KINDS.jobRun, ttlMs: MINUTE } as const;

    expect(await takeClaim(payload, claim)).toBe(true);
    expect(await takeClaim(payload, claim)).toBe(false);
  });

  it("never lapses a claim that has no expiry", async () => {
    // A receipt and a lease live in one table, and the receipt is what keeps a
    // completed render from being uploaded to Mux a second time. `expiresAt`
    // is NULL on a receipt, and no comparison against NULL is ever true — so
    // the sweep that clears a dead runner's lease cannot reach it. Asserted by
    // asking for a lease on a key a receipt already holds, which is the only
    // way the sweep runs against that row at all.
    const key = keyFor("receipt");
    const claim = { key, kind: CLAIM_KINDS.jobRun } as const;

    expect(await takeClaim(payload, claim)).toBe(true);
    expect((await rowFor(`job-run:${key}`))?.expiresAt ?? null).toBe(null);

    expect(await takeClaim(payload, { ...claim, ttlMs: MINUTE })).toBe(false);
    expect(await rowFor(`job-run:${key}`)).not.toBeNull();
  });

  it("is not writable over the API", async () => {
    /*
     * A lock anyone can POST to or delete is not a lock. The only legitimate
     * writers are the endpoints, going through the local API where
     * `overrideAccess` defaults to `true`; everything else is refused,
     * exactly as for the two collections this replaced.
     *
     * **Every caller is tried, not just the anonymous one.** Deleting
     * `create`/`update`/`delete` from the access block does not open the
     * collection to the world — it falls through to Payload's `defaultAccess`,
     * which is "any signed-in user". An earlier version of this test only
     * posted anonymously, and that mutation survived it while leaving any
     * signed-in account able to forge a receipt saying a render had already
     * been uploaded.
     */
    const key = keyFor("access");
    const forged = {
      key: `mollie-delivery:${key}`,
      kind: CLAIM_KINDS.mollieDelivery,
    };

    for (const user of [undefined, regularUser, admin]) {
      await expect(
        payload.create({
          collection: "claims",
          data: forged,
          overrideAccess: false,
          user: user as never,
        })
      ).rejects.toThrow();
    }

    // The positive beside them: the same write through the local API's own
    // default succeeds, so this is an access rule rather than a collection
    // nothing can write.
    await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery });

    for (const user of [undefined, regularUser, admin]) {
      await expect(
        payload.delete({
          collection: "claims",
          overrideAccess: false,
          user: user as never,
          where: { key: { equals: `mollie-delivery:${key}` } },
        })
      ).rejects.toThrow();
    }

    expect(await rowFor(`mollie-delivery:${key}`)).not.toBeNull();
  });

  it("is readable only by an admin", async () => {
    // Every row here is an identifier somebody else chose — a Mollie payment
    // id, a Remotion job id — and the list of them is the list of payments and
    // renders this application has handled. `endpoints/mollie.ts` refuses to
    // answer "does this payment belong to you" at all; a readable claim table
    // answers it for every payment at once.
    const key = keyFor("read-access");

    await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery });

    const readAs = (user: unknown) =>
      payload.find({
        collection: "claims",
        depth: 0,
        limit: 1,
        overrideAccess: false,
        user: user as never,
        where: { key: { equals: `mollie-delivery:${key}` } },
      });

    // `isAdmin` answers `false` rather than a `Where` filter, and Payload
    // turns that into `Forbidden` rather than an empty page — so the refusal
    // is a rejection, not a count of zero.
    await expect(readAs(undefined)).rejects.toBeInstanceOf(Forbidden);
    await expect(readAs(regularUser)).rejects.toBeInstanceOf(Forbidden);
    // The positive beside them: an operator can still see the table, which is
    // the whole reason it is `isAdmin` rather than `denyAll`.
    expect((await readAs(admin)).totalDocs).toBe(1);
  });

  it("rethrows a failure that is not a duplicate", async () => {
    // A create fails because somebody else holds the claim, and it fails
    // because the database is unreachable. Treating the second as the first is
    // how a paid-for render is silently dropped, so a failure is confirmed by
    // reading the row back.
    const key = keyFor("outage");
    const create = payload.create.bind(payload);

    vi.spyOn(payload, "create").mockImplementation(
      (args: Parameters<typeof create>[0]) =>
        args.collection === "claims"
          ? Promise.reject(new Error("D1_ERROR: network is unreachable"))
          : create(args)
    );

    const failure = await takeClaim(payload, {
      key,
      kind: CLAIM_KINDS.mollieDelivery,
    }).then(
      (taken) => {
        throw new Error(
          `the claim resolved with ${taken}; it should have thrown`
        );
      },
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/unreachable/);

    vi.restoreAllMocks();

    // The positive beside it: nothing was written, so the retry gets through.
    expect(
      await takeClaim(payload, { key, kind: CLAIM_KINDS.mollieDelivery })
    ).toBe(true);
  });
});
