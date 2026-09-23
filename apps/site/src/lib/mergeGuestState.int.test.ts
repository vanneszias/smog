// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accountFavoriteIds } from "@/lib/accountFavorites";
import { mergeGuestFavorites } from "@/lib/mergeGuestState";
import type { User } from "@/payload-types";
import config from "../payload.config";

/**
 * The server half of the guest-to-account merge, against a real database.
 *
 * Everything asked of this function is a claim about *rows*, not about a return
 * value, so the assertions read the account back rather than trusting what
 * `mergeGuestFavorites` says it did. Two of the five named tests cannot be
 * written any other way: "is idempotent" is a statement about what two runs
 * leave behind, and "ignores a guest id that no longer exists" is a statement
 * about what Payload will happily store if nobody stops it — `isValidID` is a
 * `typeof` check, so a dangling relationship passes validation and only a read
 * of the row shows it.
 *
 * A fresh account per test. The merge is a whole-array write, so tests that
 * shared one would order-depend on each other in exactly the way the
 * function is supposed to be immune to, and a failure would say nothing
 * about which test caused it.
 */
describe("mergeGuestFavorites", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const SITE = "http://localhost:3003";
  const PASSWORD = "merge-guest-int-password";

  /*
   * `crypto.randomUUID`, not `Date.now()`. `email` is unique and the local
   * D1 at `.wrangler/state/vitest` is never cleared between runs, so a
   * timestamp collides with an earlier run — and a `beforeAll` that throws
   * makes Vitest report this file's tests as *skipped*, which looks green.
   * Two files can also start in the same millisecond.
   */
  const run = crypto.randomUUID().slice(0, 8);

  /** More than Payload's default page size of ten, deliberately. See below. */
  const MANY = 12;

  let categoryId: number;
  let activeIds: string[];
  let inactiveId: string;
  let missingId: string;

  const createMember = async (): Promise<User> => {
    const user = await payload.create({
      collection: "users",
      data: {
        email: `merge-guest-${crypto.randomUUID()}@example.test`,
        password: PASSWORD,
        role: "user",
      },
    });

    return user as User;
  };

  const createGesture = async (label: string, isActive: boolean) => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive,
        name: `Merge guest int ${run} ${label}`,
        playbackId: `mergeint-${run}-${label}`,
      },
      locale: "nl",
    });

    return String(gesture.id);
  };

  const favoritesOf = async (user: User): Promise<string[]> => {
    const stored = (await payload.findByID({
      collection: "users",
      depth: 0,
      id: user.id,
    })) as User;

    return accountFavoriteIds(stored);
  };

  const setFavorites = async (user: User, ids: string[]): Promise<void> => {
    await payload.update({
      collection: "users",
      data: { favorites: ids.map(Number) },
      depth: 0,
      id: user.id,
    });
  };

  const merge = async (user: User, ids: string[]) =>
    await mergeGuestFavorites({ ids, payload, user });

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Merge guest int ${run}` },
      locale: "nl",
    });

    categoryId = Number(category.id);

    activeIds = [];

    for (let index = 0; index < MANY; index += 1) {
      // Sequentially: each `create` writes the same join table, and the
      // ordering of `activeIds` is asserted on below.
      activeIds.push(await createGesture(`active-${index}`, true));
    }

    inactiveId = await createGesture("inactive", false);

    // A row that really is gone, rather than an id invented out of thin air:
    // "no longer exists" is the case a guest hits when an editor deletes a
    // gesture they had bookmarked.
    const doomed = await createGesture("doomed", true);

    await payload.delete({ collection: "gestures", id: doomed });
    missingId = doomed;
  });

  /**
   * Puts the fixtures back. The local D1 is shared and never cleared, and a
   * mutation sweep runs this `beforeAll` once per mutation — thirteen
   * gestures a run adds up fast, and `apps/site/README.md` records what
   * happens when it does. Keyed on this run's own strings, so nothing
   * another worker created is touched.
   */
  afterAll(async () => {
    await payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `mergeint-${run}-` } },
    });
    await payload.delete({
      collection: "categories",
      where: { name: { equals: `Merge guest int ${run}` } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { like: "merge-guest-" } },
    });
  });

  it("adds guest favorites to an empty account", async () => {
    const user = await createMember();
    const guest = [activeIds[0], activeIds[1]] as string[];

    const result = await merge(user, guest);

    expect(result?.added).toEqual(guest);
    expect(await favoritesOf(user)).toEqual(guest);
  });

  it("is idempotent — running it twice leaves one of each", async () => {
    /*
     * The normal case, not the exceptional one: a second sign-in in the same
     * browser still has the same local array, and so does a reload between
     * the write and the clear. There are no transactions here, so this
     * property is the only thing standing between a re-run and a duplicated
     * list.
     *
     * The second run's `added` is asserted as well as the stored array,
     * because `Users.ts`'s `beforeChange` hook deduplicates on the way to
     * the database — so a merge that re-added everything would still store
     * one of each, and only the report would be wrong. Without this line the
     * test passes against a function with no idempotence at all.
     */
    const user = await createMember();
    const guest = [activeIds[0], activeIds[1]] as string[];

    await merge(user, guest);
    const second = await merge(user, guest);

    expect(second?.added).toEqual([]);
    expect(await favoritesOf(user)).toEqual(guest);
  });

  it("does not duplicate a gesture already favourited on the account", async () => {
    const user = await createMember();
    const shared = activeIds[0] as string;

    await setFavorites(user, [shared]);

    const result = await merge(user, [shared, activeIds[1] as string]);

    expect(result?.added).toEqual([activeIds[1]]);
    expect(await favoritesOf(user)).toEqual([shared, activeIds[1]]);
  });

  it("leaves the account's existing favorites in place", async () => {
    /*
     * A `hasMany` relationship is written whole, so "add the guest's ids" is
     * really "replace the array" — dropping what was already there is the
     * bug that shape invites, and it is invisible to a test that only looks
     * at the ids it just merged.
     */
    const user = await createMember();
    const owned = [activeIds[2], activeIds[3]] as string[];

    await setFavorites(user, owned);

    const result = await merge(user, [activeIds[4] as string]);

    expect(result?.added).toEqual([activeIds[4]]);
    expect(await favoritesOf(user)).toEqual([...owned, activeIds[4]]);
  });

  it("ignores a guest id that no longer exists", async () => {
    /*
     * **Payload will not do this for us.** Its whole relationship validation
     * is `isValidID`, which for a numeric key is `typeof value === 'number'`
     * — no query, no existence check — so `favorites: [<deleted id>]` is
     * stored without complaint and the favorites page then resolves it to
     * nothing forever. The merge has to resolve the ids itself.
     *
     * `localStorage` is user-writable too, hence the junk entries: a
     * non-numeric id is not rejected by Payload's query layer either, it is
     * mapped through `parseFloat` and bound as `NaN`.
     */
    const user = await createMember();

    const result = await merge(user, [
      activeIds[5] as string,
      missingId,
      "not-an-id",
      "0007",
      "",
    ]);

    expect(result?.added).toEqual([activeIds[5]]);
    expect(await favoritesOf(user)).toEqual([activeIds[5]]);
  });

  it("ignores a gesture the reader is not allowed to see", async () => {
    // The lookup runs as the signing-in account with `overrideAccess: false`,
    // so `publicReadActive` decides. A gesture an editor deactivated after
    // it was bookmarked is dropped rather than carried into the account,
    // which is the same rule the detail page and the favorites list run
    // under. Without the access check the merge would be the one way to get
    // an inactive gesture onto an ordinary account.
    const user = await createMember();

    const result = await merge(user, [inactiveId, activeIds[6] as string]);

    expect(result?.added).toEqual([activeIds[6]]);
    expect(await favoritesOf(user)).toEqual([activeIds[6]]);
  });

  it("merges more guest favorites than one page of gestures", async () => {
    // Payload's default `limit` is ten. A guest with eleven favorites would
    // otherwise have the last one reported as "no longer exists" and
    // silently dropped — a data-loss bug that only appears past a threshold
    // no smaller test crosses.
    const user = await createMember();

    const result = await merge(user, activeIds);

    expect(result?.added).toHaveLength(MANY);
    expect(await favoritesOf(user)).toEqual(activeIds);
  });

  it("collapses a guest list that repeats an id", async () => {
    const user = await createMember();
    const twice = activeIds[7] as string;

    const result = await merge(user, [twice, twice]);

    expect(result?.added).toEqual([twice]);
    expect(await favoritesOf(user)).toEqual([twice]);
  });

  it("does not go looking for gestures when nothing in the list is usable", async () => {
    /*
     * `localStorage` is user-writable, so "the whole list is junk" is a
     * reachable state — and the query that would be issued for it is an
     * **unbounded** one: `limit` is the number of ids, and Payload reads
     * everything when that is zero. `apps/site/README.md` records what an
     * unbounded read costs against D1's bound-parameter cap, and it is a
     * failure in a *different* test file, which is the kind nobody
     * attributes correctly.
     *
     * The spy is on `payload.find` rather than on a timing, because "did not
     * ask" is the property and there is no other way to see it.
     */
    const user = await createMember();
    const find = vi.spyOn(payload, "find");

    try {
      const result = await merge(user, ["not-an-id", ""]);

      expect(result).toEqual({ added: [], favorites: [] });
      expect(find).not.toHaveBeenCalled();
    } finally {
      find.mockRestore();
    }
  });

  it("does not rewrite the account when there is nothing new", async () => {
    /*
     * The re-run is the ordinary case, so the ordinary case should not cost
     * a row rewrite, a hook pass and a `updatedAt` bump. `updatedAt` is the
     * black-box way to see that: Payload sets it on every update, so a merge
     * that wrote the array it had just read would move it.
     */
    const user = await createMember();

    await merge(user, [activeIds[8] as string]);

    const before = (await payload.findByID({
      collection: "users",
      depth: 0,
      id: user.id,
    })) as User;

    await merge(user, [activeIds[8] as string]);

    const after = (await payload.findByID({
      collection: "users",
      depth: 0,
      id: user.id,
    })) as User;

    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("refuses an account that has been deleted under its own session", async () => {
    // A delete in another tab. The session still verifies — the JWT is
    // self-contained — but there is no row to merge into, and answering as
    // though the merge happened would be the one case where the local array
    // is cleared against nothing.
    const user = await createMember();

    await payload.delete({ collection: "users", id: user.id });

    await expect(merge(user, [activeIds[9] as string])).resolves.toBeNull();
  });

  /**
   * The endpoint in front of it. Driven through `handleEndpoints` rather
   * than by calling the handler, for the reason `favorites.int.test.ts`
   * gives: half of what can go wrong here is routing and authentication,
   * and a hand-built `req` exercises neither. A handler registered at the
   * wrong path answers 404 here and passes every direct-call test.
   */
  describe("the merge endpoint", () => {
    const post = (
      body: unknown,
      init: { contentType?: string; cookie?: string; origin?: string } = {}
    ) => {
      const headers = new Headers({
        "Content-Type": init.contentType ?? "application/json",
      });

      if (init.cookie !== undefined) {
        headers.set("Cookie", init.cookie);
      }

      if (init.origin !== undefined) {
        headers.set("Origin", init.origin);
      }

      return handleEndpoints({
        config,
        request: new Request(`${SITE}/api/account/merge-favorites`, {
          body: JSON.stringify(body),
          headers,
          method: "POST",
        }),
      });
    };

    const signIn = async (user: User) => {
      const { token } = await payload.login({
        collection: "users",
        data: { email: user.email, password: PASSWORD },
      });

      if (token === undefined) {
        throw new Error("login issued no token");
      }

      return `payload-token=${token}`;
    };

    it("is reachable at the path the rewrite points at", async () => {
      const user = await createMember();
      const cookie = await signIn(user);

      const response = await post(
        { ids: [activeIds[10]] },
        { cookie, origin: SITE }
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        added: [activeIds[10]],
        favorites: [activeIds[10]],
      });
      expect(await favoritesOf(user)).toEqual([activeIds[10]]);
    });

    it("refuses a caller with no session", async () => {
      const response = await post({ ids: [activeIds[0]] }, { origin: SITE });

      expect(response.status).toBe(401);
    });

    it("refuses a cross-site post", async () => {
      // `SameSite=Lax` already strips the cookie from one of these, so this
      // is the second lock rather than the first — and the one that survives
      // somebody needing `SameSite=None` for an embedded surface.
      const user = await createMember();
      const cookie = await signIn(user);

      const response = await post(
        { ids: [activeIds[0]] },
        { cookie, origin: "https://evil.example" }
      );

      expect(response.status).toBe(403);
      expect(await favoritesOf(user)).toEqual([]);
    });

    it("refuses a body that is not a list of ids", async () => {
      const user = await createMember();
      const cookie = await signIn(user);

      const response = await post({ ids: "7" }, { cookie, origin: SITE });

      expect(response.status).toBe(400);
    });

    it("refuses JSON that arrives labelled as a form", async () => {
      /*
       * The body is perfectly good JSON — only the `Content-Type` is a form
       * encoding. That is the shape a cross-site `<form>` can produce and a
       * `fetch` cannot, so refusing the encoding is a door this endpoint
       * closes on top of `SameSite=Lax`, exactly as its sibling does.
       *
       * Sending valid JSON is the point: a garbled body would be refused by
       * `req.json()` throwing, and the test would prove nothing about the
       * header check.
       */
      const user = await createMember();
      const cookie = await signIn(user);

      const response = await post(
        { ids: [activeIds[11]] },
        {
          contentType: "application/x-www-form-urlencoded",
          cookie,
          origin: SITE,
        }
      );

      expect(response.status).toBe(400);
      expect(await favoritesOf(user)).toEqual([]);
    });

    it("refuses a session whose account has been deleted", async () => {
      /*
       * Recorded rather than claimed: this comes back 401 from the session
       * check, not from the handler's own `null` branch, because Payload's
       * JWT strategy reads the user row before the handler runs and finds
       * nothing. The handler still has to answer the `null` — the merge
       * returns it, and `mergeGuestFavorites` has its own test for that
       * above — but the branch is not reachable over HTTP, which is stated
       * here so nobody reads its coverage as proof.
       */
      const user = await createMember();
      const cookie = await signIn(user);

      await payload.delete({ collection: "users", id: user.id });

      const response = await post(
        { ids: [activeIds[0]] },
        { cookie, origin: SITE }
      );

      expect(response.status).toBe(401);
    });
  });
});
