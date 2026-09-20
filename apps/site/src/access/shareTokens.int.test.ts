// @vitest-environment node
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import { fetchSharedList } from "../lib/sharedList";
import config from "../payload.config";

/**
 * @fileoverview Share links, against a real database.
 *
 * The spec's "Sharing is inert until Stage 3" records four gaps. Three of
 * them are closed here and every one is a claim about what the *database*
 * answers, not about what a function returns:
 *
 * 1. nothing minted the tokens, so both columns were always NULL;
 * 2. a signed-in recipient's access filter replaced their token instead of
 *    widening with it, so they saw nothing;
 * 3. `visibility` was never consulted, so un-sharing revoked nothing.
 *
 * The fourth (foreign-key behaviour) is Task 8 and is deliberately untouched.
 *
 * Why an integration file rather than more unit tests: the unit tests in
 * `lists.test.ts` assert the *shape* of the `Where` each access function
 * returns, which cannot tell a filter Payload honours from one it silently
 * drops, and cannot see a `beforeChange` hook at all. In particular the
 * tokenless guard (`if (!token) return false`) is only provably load-bearing
 * against a row whose token column is genuinely NULL — see `legacyListId`
 * below, which is kept NULL for exactly that purpose.
 */

/*
 * Every fixture value that lands on a `unique` or otherwise collision-prone
 * column carries this. `.wrangler/state/vitest` is never cleared between
 * runs, `lists.viewShareToken` and `lists.editShareToken` are `unique: true`,
 * and a collision throws inside `beforeAll` — which Vitest reports as
 * *skipped* rather than failed, i.e. a green run that tested nothing.
 */
const RUN = crypto.randomUUID();

const PASSWORD = "correct-horse-battery-staple";

/** What `crypto.randomUUID()` produces, and nothing else. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Payload = Awaited<ReturnType<typeof getPayload>>;

const anonymousReq = (token?: string) => ({
  searchParams: new URLSearchParams(
    token === undefined ? {} : { shareToken: token }
  ),
});

describe("share tokens against a real database", () => {
  let payload: Payload;
  let ownerId: number;
  let strangerId: number;
  let gestureId: number;

  /**
   * A list created before this task existed: both token columns NULL.
   *
   * It is the whole reason the tokenless guard can be proven at all. With
   * minting in place every *new* row has a token, so a mutated access
   * function that built `{ viewShareToken: { equals: undefined } }` would
   * match no row and the mutation would survive by accident. This row is the
   * row it matches.
   */
  let legacyListId: number;

  const createList = async (
    overrides: Record<string, unknown> = {}
  ): Promise<{
    id: number;
    viewShareToken?: string | null;
    editShareToken?: string | null;
  }> =>
    await payload.create({
      collection: "lists",
      data: {
        items: [{ gesture: gestureId }],
        name: `Lijst ${RUN} ${crypto.randomUUID()}`,
        owner: ownerId,
        visibility: "shared",
        ...overrides,
      },
      overrideAccess: true,
    });

  const findAs = async (options: {
    token?: string;
    user?: { collection: "users"; id: number; role: string };
  }) =>
    await payload.find({
      collection: "lists",
      disableErrors: true,
      // Well past the number of lists one run creates. Payload's default of
      // ten would silently drop the list a `toContain` is looking for and
      // turn a passing guard into a coin flip.
      limit: 100,
      overrideAccess: false,
      req: anonymousReq(options.token),
      user: options.user,
    });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Delen ${RUN}` },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive: true,
        name: `Delen ${RUN}`,
        playbackId: `pb-share-${RUN}`,
      },
    });
    gestureId = gesture.id;

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `share-owner-${RUN}@example.com`,
        password: PASSWORD,
        role: "user",
      },
    });
    ownerId = owner.id;

    const stranger = await payload.create({
      collection: "users",
      data: {
        email: `share-stranger-${RUN}@example.com`,
        password: PASSWORD,
        role: "user",
      },
    });
    strangerId = stranger.id;

    const legacy = await createList({ name: `Legacy ${RUN}` });
    // Minting happens on create, so the only way to get a pre-Task-7 row is
    // to clear the columns afterwards. `overrideAccess: true` is what gets
    // past the owner-only field guard; the update hook only rotates on a
    // transition to `private`, so it does not re-mint them.
    await payload.update({
      collection: "lists",
      data: { editShareToken: null, viewShareToken: null },
      id: legacy.id,
      overrideAccess: true,
    });
    legacyListId = legacy.id;
  });

  describe("minting", () => {
    it("mints both share tokens when a list is created", async () => {
      const list = await createList();

      expect(list.viewShareToken).toMatch(UUID);
      expect(list.editShareToken).toMatch(UUID);
    });

    it("mints two different tokens, so a view link is not also an edit link", async () => {
      const list = await createList();

      expect(list.viewShareToken).not.toBe(list.editShareToken);
    });

    it("mints a token even for a list created private, so the owner always has a link to turn on", async () => {
      const list = await createList({ visibility: "private" });

      expect(list.viewShareToken).toMatch(UUID);
    });

    it("keeps tokens supplied at create rather than overwriting them", async () => {
      // Every pre-existing fixture in this suite creates a list with explicit
      // tokens and then reads by them. Minting that clobbered them would fail
      // those files somewhere else entirely; this says it here.
      const supplied = `supplied-view-${RUN}`;
      const list = await createList({ viewShareToken: supplied });

      expect(list.viewShareToken).toBe(supplied);
    });

    it("mints a distinct token per list rather than one shared value", async () => {
      const [first, second] = await Promise.all([createList(), createList()]);

      expect(first.viewShareToken).not.toBe(second.viewShareToken);
    });
  });

  describe("the tokenless guard", () => {
    it("has a list with no tokens at all on hand, which the two tests below depend on", async () => {
      // Asserted rather than assumed. If clearing the columns ever stops
      // working — a `required: true`, a hook that re-mints on update — the
      // guard tests below would quietly become vacuous: with every row
      // carrying a token, `{ equals: undefined }` matches nothing and a
      // mutation that deletes the guard survives by luck. This fails first
      // and says why.
      const legacy = await payload.findByID({
        collection: "lists",
        id: legacyListId,
        overrideAccess: true,
      });

      expect(legacy.viewShareToken).toBeNull();
      expect(legacy.editShareToken).toBeNull();
    });

    it("shows an anonymous request with no token nothing, even though a list exists with no token either", async () => {
      // The trap the spec records: without `if (!token) return false` this
      // builds `{ viewShareToken: { equals: undefined } }`, which the query
      // layer matches against every row whose column is NULL. `legacyListId`
      // is such a row, so this assertion is the one that notices.
      const result = await findAs({});

      expect(result.docs).toHaveLength(0);
    });

    it("shows an anonymous request with a blank token nothing", async () => {
      const result = await findAs({ token: "   " });

      expect(result.docs).toHaveLength(0);
    });

    it("cannot reach the tokenless legacy list with any token at all", async () => {
      const result = await findAs({ token: "anything" });

      expect(result.docs.map((doc) => doc.id)).not.toContain(legacyListId);
    });
  });

  describe("following a link", () => {
    it("shows an anonymous reader the list its view token names", async () => {
      const list = await createList();

      const result = await findAs({ token: list.viewShareToken ?? "" });

      expect(result.docs.map((doc) => doc.id)).toEqual([list.id]);
    });

    it("does not let a view token be used as an edit token", async () => {
      const list = await createList({ allowSharedEditing: true });

      await expect(
        payload.update({
          collection: "lists",
          data: { name: `Gekaapt ${RUN}` },
          id: list.id,
          overrideAccess: false,
          req: anonymousReq(list.viewShareToken ?? ""),
        })
      ).rejects.toThrow();
    });

    it("does not let an edit token stand in for a view token", async () => {
      // The mutation this exists for is swapping `viewShareToken` for
      // `editShareToken` in `listReadAccess`. Both columns are now populated
      // on every row, so a shape assertion alone would not notice: only
      // reading by the wrong one and getting nothing does.
      const list = await createList();

      const result = await findAs({ token: list.editShareToken ?? "" });

      expect(result.docs.map((doc) => doc.id)).not.toContain(list.id);
    });

    it("shows a signed-in non-owner the list its view token names", async () => {
      // Gap 2. Before this task the signed-in branch *replaced* the filter
      // with `{ owner: { equals: req.user.id } }`, so an authenticated
      // recipient of a share link saw nothing at all.
      const list = await createList();

      const result = await findAs({
        token: list.viewShareToken ?? "",
        user: { collection: "users", id: strangerId, role: "user" },
      });

      expect(result.docs.map((doc) => doc.id)).toContain(list.id);
    });

    it("shows a signed-in non-owner nothing when they present no token", async () => {
      const list = await createList();

      const result = await findAs({
        user: { collection: "users", id: strangerId, role: "user" },
      });

      expect(result.docs.map((doc) => doc.id)).not.toContain(list.id);
    });

    it("still shows a signed-in owner their own lists while they hold someone else's token", async () => {
      // Widen, not replace, in the other direction too: a token must not cost
      // the holder access to the lists they already owned.
      const mine = await createList();
      const theirs = await createList({ owner: strangerId });

      const result = await findAs({
        token: theirs.viewShareToken ?? "",
        user: { collection: "users", id: ownerId, role: "user" },
      });

      const ids = result.docs.map((doc) => doc.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(theirs.id);
    });

    it("gives a signed-in non-owner no way to delete a list they merely hold a token for", async () => {
      const list = await createList({ allowSharedEditing: true });

      await expect(
        payload.delete({
          collection: "lists",
          id: list.id,
          overrideAccess: false,
          req: anonymousReq(list.editShareToken ?? ""),
          user: { collection: "users", id: strangerId, role: "user" },
        })
      ).rejects.toThrow();
    });
  });

  describe("revocation by rotation", () => {
    it("stops honouring a share link after the list is made private", async () => {
      // Review Focus item 4, and the assertion the whole task turns on.
      const list = await createList();
      const sharedToken = list.viewShareToken ?? "";

      const before = await findAs({ token: sharedToken });
      expect(before.docs).toHaveLength(1);

      await payload.update({
        collection: "lists",
        data: { visibility: "private" },
        id: list.id,
        overrideAccess: true,
      });

      const after = await findAs({ token: sharedToken });
      expect(after.docs).toHaveLength(0);
    });

    it("rotates the edit token too, not only the view token", async () => {
      const list = await createList({ allowSharedEditing: true });
      const editToken = list.editShareToken ?? "";

      await payload.update({
        collection: "lists",
        data: { visibility: "private" },
        id: list.id,
        overrideAccess: true,
      });

      await expect(
        payload.update({
          collection: "lists",
          data: { name: `Na intrekking ${RUN}` },
          id: list.id,
          overrideAccess: false,
          req: anonymousReq(editToken),
        })
      ).rejects.toThrow();
    });

    it("rotates to fresh tokens rather than clearing them, so the owner still has a link to re-share", async () => {
      const list = await createList();

      const updated = await payload.update({
        collection: "lists",
        data: { visibility: "private" },
        id: list.id,
        overrideAccess: true,
      });

      expect(updated.viewShareToken).toMatch(UUID);
      expect(updated.viewShareToken).not.toBe(list.viewShareToken);
      expect(updated.editShareToken).not.toBe(list.editShareToken);
    });

    it("leaves the tokens alone on an update that does not touch visibility", async () => {
      // Rotation is revocation. Rotating on every save would invalidate a
      // live share link whenever the owner renamed the list.
      const list = await createList();

      const updated = await payload.update({
        collection: "lists",
        data: { name: `Hernoemd ${RUN}` },
        id: list.id,
        overrideAccess: true,
      });

      expect(updated.viewShareToken).toBe(list.viewShareToken);
      expect(updated.editShareToken).toBe(list.editShareToken);
    });

    it("leaves the tokens alone when a private list is saved again while still private", async () => {
      const list = await createList({ visibility: "private" });

      const updated = await payload.update({
        collection: "lists",
        data: { name: `Nog steeds prive ${RUN}`, visibility: "private" },
        id: list.id,
        overrideAccess: true,
      });

      expect(updated.viewShareToken).toBe(list.viewShareToken);
    });

    it("leaves the tokens alone when a list is shared", async () => {
      const list = await createList({ visibility: "private" });

      const updated = await payload.update({
        collection: "lists",
        data: { visibility: "shared" },
        id: list.id,
        overrideAccess: true,
      });

      expect(updated.viewShareToken).toBe(list.viewShareToken);
    });
  });

  describe("fetchSharedList", () => {
    it("resolves a list from its view token for an anonymous reader", async () => {
      const list = await createList();

      const found = await fetchSharedList({
        locale: "nl",
        token: list.viewShareToken ?? "",
      });

      expect(found?.id).toBe(list.id);
    });

    it("resolves the list the token names and not merely some list", async () => {
      // `limit: 1` with a filter that matched more than the token would hand
      // back whichever row the database happened to sort first. Two lists
      // exist here and only one of them is asked for.
      const other = await createList();
      const list = await createList();

      const found = await fetchSharedList({
        locale: "nl",
        token: list.viewShareToken ?? "",
      });

      expect(found?.id).toBe(list.id);
      expect(found?.id).not.toBe(other.id);
    });

    it("answers null for a token that names no list, rather than throwing", async () => {
      expect(
        await fetchSharedList({ locale: "nl", token: `unknown-${RUN}` })
      ).toBeNull();
    });

    it("answers null for a blank token, rather than matching a list with no token", async () => {
      expect(await fetchSharedList({ locale: "nl", token: "   " })).toBeNull();
    });

    it("resolves a list for a reader who is signed in, since it never asks who they are", async () => {
      // The page reads anonymously on purpose — see `fetchSharedList`. The
      // signed-in half of the spec's gap 2 is asserted against the access
      // layer instead, in "shows a signed-in non-owner the list its view
      // token names" above, because that is the path (Payload's REST API)
      // where `req.user` is set by Payload rather than by us.
      const list = await createList();

      const found = await fetchSharedList({
        locale: "nl",
        token: list.viewShareToken ?? "",
      });

      expect(found?.id).toBe(list.id);
    });

    it("answers null once the list has been made private", async () => {
      const list = await createList();
      const token = list.viewShareToken ?? "";

      await payload.update({
        collection: "lists",
        data: { visibility: "private" },
        id: list.id,
        overrideAccess: true,
      });

      expect(await fetchSharedList({ locale: "nl", token })).toBeNull();
    });

    it("populates each item's gesture deeply enough to name its categories", async () => {
      const list = await createList();

      const found = await fetchSharedList({
        locale: "nl",
        token: list.viewShareToken ?? "",
      });

      const gesture = found?.items?.[0]?.gesture;
      expect(typeof gesture).toBe("object");
      const categories = (gesture as { categories?: unknown[] }).categories;
      expect(categories?.every((c) => typeof c === "object")).toBe(true);
    });
  });
});
