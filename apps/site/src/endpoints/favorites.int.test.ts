// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountFavoriteIds } from "@/lib/accountFavorites";
import type { User } from "@/payload-types";
import config from "../payload.config";

/**
 * `POST /api/account/favorites`, driven through `handleEndpoints` against a
 * real database.
 *
 * `handleEndpoints` rather than the handler directly, for the same reason
 * `auth.int.test.ts` gives: half of what can go wrong here is routing and
 * authentication, and neither is exercised by a handler called with a
 * hand-built `req`. The cookie goes in as a `Cookie` header and Payload's own
 * strategies resolve it, which is also what makes "signed out" a real case
 * rather than a stubbed one.
 */
describe("the account favorites endpoint", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;

  const SITE = "http://localhost:3003";
  const PASSWORD = "favorites-int-password";
  const run = crypto.randomUUID().slice(0, 8);

  let memberCookie: string;
  let memberId: number | string;
  let otherCookie: string;
  let categoryId: number;
  let activeId: string;
  let secondId: string;
  let inactiveId: string;

  const unique = (prefix: string) =>
    `favorites-${prefix}-${crypto.randomUUID()}@example.test`;

  const signIn = async (email: string) => {
    const { token } = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    if (token === undefined) {
      throw new Error("login issued no token");
    }

    return `payload-token=${token}`;
  };

  const createMember = async (prefix: string) => {
    const email = unique(prefix);
    const user = await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    });

    return { cookie: await signIn(email), id: user.id };
  };

  const createGesture = async (label: string, isActive: boolean) => {
    const gesture = await payload.create({
      collection: "gestures",
      data: {
        categories: [categoryId],
        isActive,
        name: `Favorites int ${run} ${label}`,
        playbackId: `favint-${run}-${label}`,
      },
      locale: "nl",
    });

    return String(gesture.id);
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const member = await createMember("member");
    memberCookie = member.cookie;
    memberId = member.id;
    otherCookie = (await createMember("other")).cookie;

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Favorites int ${run}` },
      locale: "nl",
    });

    categoryId = Number(category.id);

    activeId = await createGesture("active", true);
    secondId = await createGesture("second", true);
    inactiveId = await createGesture("inactive", false);
  });

  /**
   * Puts the fixtures back.
   *
   * Most integration files in this app leave theirs behind, and the shared
   * local D1 at `.wrangler/state/vitest` is never cleared — which is how
   * `fetchCategoryOptions` ends up binding more parameters than D1 allows
   * and failing a *different* file's tests. A 31-mutation sweep is 32 runs
   * of this `beforeAll`, so a file that adds a category and three gestures
   * each time is a measurable contributor. The captured error and the
   * measured cap are in `apps/site/README.md`.
   *
   * Deletes are keyed on this run's own unique strings, so nothing another
   * worker or another file created is touched.
   */
  afterAll(async () => {
    await payload.delete({
      collection: "gestures",
      where: { playbackId: { like: `favint-${run}-` } },
    });
    await payload.delete({
      collection: "categories",
      where: { name: { equals: `Favorites int ${run}` } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { like: "favorites-" } },
    });
  });

  const post = (
    body: unknown,
    init: {
      contentType?: string;
      cookie?: string;
      origin?: string;
      raw?: string;
    } = {}
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
      request: new Request(`${SITE}/api/account/favorites`, {
        body: init.raw ?? JSON.stringify(body),
        headers,
        method: "POST",
      }),
    });
  };

  const favoritesOf = async (id: number | string): Promise<string[]> => {
    const user = (await payload.findByID({
      collection: "users",
      depth: 0,
      id,
    })) as User;

    return accountFavoriteIds(user);
  };

  const setFavorite = async (gestureId: string, favorite: boolean) =>
    await post({ favorite, gestureId }, { cookie: memberCookie });

  it("is reachable at the path the rewrite points at", async () => {
    // A handler registered at the wrong path answers 404 here and passes
    // every test that calls it directly.
    const response = await setFavorite(activeId, false);

    expect(response.status).toBe(200);
  });

  it("stores a favourite on the account", async () => {
    const response = await setFavorite(activeId, true);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ favorite: true });
    expect(await favoritesOf(memberId)).toContain(activeId);
  });

  it("is idempotent — favouriting twice leaves one", async () => {
    /*
     * The property the whole design rests on, and the reason the request
     * carries a wanted state rather than a toggle: there are no transactions
     * on any write path in this app, a double-submitted press is ordinary,
     * and Task 6's merge re-runs over the same ids on every sign-in. A
     * toggle applied twice undoes itself.
     *
     * `Users.ts`'s `beforeChange` dedupe hook is the second half of this and
     * is not a substitute for it: the hook keeps the *storage* clean, and
     * this keeps the *answer* right.
     */
    await setFavorite(activeId, true);
    await setFavorite(activeId, true);

    const stored = await favoritesOf(memberId);

    expect(stored.filter((id) => id === activeId)).toEqual([activeId]);
  });

  it("removes a favourite the account holds", async () => {
    await setFavorite(activeId, true);
    const response = await setFavorite(activeId, false);

    await expect(response.json()).resolves.toEqual({ favorite: false });
    expect(await favoritesOf(memberId)).not.toContain(activeId);
  });

  it("is idempotent in the other direction too", async () => {
    await setFavorite(activeId, false);
    const response = await setFavorite(activeId, false);

    expect(response.status).toBe(200);
    expect(await favoritesOf(memberId)).not.toContain(activeId);
  });

  it("leaves the account's other favorites alone", async () => {
    /*
     * A `hasMany` relationship is written whole, so "add one" is really
     * "replace the array". Dropping the rest is exactly the bug that shape
     * invites.
     *
     * **The middle assertion is the one that matters, and it was missing.**
     * An earlier version of this test only checked the end state, and a
     * mutation that replaced the whole array on every add — `[gestureId]`
     * instead of the union — passed it: adding A then B leaves `[B]`,
     * removing A leaves `[B]`, and the final expectation is `[B]` either
     * way. Green, and proving nothing. Transcript M21 in the Task 4 report.
     */
    await setFavorite(activeId, true);
    await setFavorite(secondId, true);

    expect(await favoritesOf(memberId)).toEqual([activeId, secondId]);

    await setFavorite(activeId, false);

    expect(await favoritesOf(memberId)).toEqual([secondId]);

    await setFavorite(secondId, false);
  });

  it("does not touch another account", async () => {
    await setFavorite(activeId, true);

    const response = await post(
      { favorite: true, gestureId: secondId },
      { cookie: otherCookie }
    );

    expect(response.status).toBe(200);
    expect(await favoritesOf(memberId)).toEqual([activeId]);

    await setFavorite(activeId, false);
    await post(
      { favorite: false, gestureId: secondId },
      { cookie: otherCookie }
    );
  });

  it("refuses a caller with no session", async () => {
    const response = await post({ favorite: true, gestureId: activeId });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "signed-out" });
  });

  it("refuses a caller whose cookie is not a token", async () => {
    // What an expired or rotated session looks like on the wire: the browser
    // still sends a cookie, and Payload resolves it to nobody.
    const response = await post(
      { favorite: true, gestureId: activeId },
      { cookie: "payload-token=not.a.jwt" }
    );

    expect(response.status).toBe(401);
  });

  it("tells a caller not to cache the answer", async () => {
    const response = await setFavorite(activeId, false);

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("tells an unauthenticated caller the same", async () => {
    const response = await post({ favorite: true, gestureId: activeId });

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses a gesture that does not exist", async () => {
    /*
     * Payload's own relationship validation does **not** check that the row
     * is there: `validations.relationship` filters on `isValidID`, which for
     * the `number` id type is a `typeof value === 'number'` test and nothing
     * more (`payload/dist/utilities/isValidID.js`, 3.89.0). Without this
     * check the endpoint happily writes a dangling favourite that no page
     * can ever render.
     */
    const response = await post(
      { favorite: true, gestureId: "999000001" },
      { cookie: memberCookie }
    );

    expect(response.status).toBe(404);
    expect(await favoritesOf(memberId)).not.toContain("999000001");
  });

  it("refuses a gesture this visitor is not allowed to see", async () => {
    // `publicReadActive` hides an inactive gesture from a non-admin, and a
    // favourite is a read of it by another name: a 200 here would confirm
    // that an unpublished gesture exists.
    const response = await post(
      { favorite: true, gestureId: inactiveId },
      { cookie: memberCookie }
    );

    expect(response.status).toBe(404);
    expect(await favoritesOf(memberId)).not.toContain(inactiveId);
  });

  it("refuses an id that is not an id", async () => {
    for (const gestureId of ["abc", "0", "007", ""]) {
      const response = await post(
        { favorite: true, gestureId },
        { cookie: memberCookie }
      );

      expect(response.status, gestureId).toBe(400);
    }
  });

  it("refuses a body missing the state it is supposed to carry", async () => {
    for (const body of [{ gestureId: activeId }, { favorite: true }, {}, []]) {
      const response = await post(body, { cookie: memberCookie });

      expect(response.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses a state that is a string rather than a boolean", async () => {
    // `"false"` is truthy. A handler that coerced would un-favourite nothing
    // and favourite everything.
    const response = await post(
      { favorite: "false", gestureId: activeId },
      { cookie: memberCookie }
    );

    expect(response.status).toBe(400);
  });

  it("refuses a body that is not JSON at all rather than throwing", async () => {
    const response = await post(null, {
      cookie: memberCookie,
      raw: "{not json",
    });

    expect(response.status).toBe(400);
  });

  it("refuses a form encoding", async () => {
    // This is not a form target, and accepting the one encoding a
    // cross-site form can produce buys nothing.
    const response = await post(null, {
      contentType: "application/x-www-form-urlencoded",
      cookie: memberCookie,
      raw: `favorite=true&gestureId=${activeId}`,
    });

    expect(response.status).toBe(400);
  });

  it("refuses a JSON body sent under a form-safe content type", async () => {
    /*
     * The case that makes the content-type check load-bearing rather than
     * decorative, and it took a surviving mutation to find it. Deleting the
     * check left the test above green — `req.json()` rejects
     * `favorite=true&gestureId=1` on its own, so the 400 still arrived — and
     * the check looked redundant.
     *
     * It is not. `text/plain` is one of the three encodings an HTML form can
     * produce without a CORS preflight, so it is exactly what a cross-site
     * form would use to smuggle a valid JSON body in. `SameSite=Lax` keeps
     * the session cookie off that request, which is why this is the second
     * lock and not the first — but a second lock that no test can tell from
     * an unlocked door is not a lock. Transcript M28 in the Task 4 report.
     */
    const response = await post(null, {
      contentType: "text/plain",
      cookie: memberCookie,
      raw: JSON.stringify({ favorite: true, gestureId: activeId }),
    });

    expect(response.status).toBe(400);
    expect(await favoritesOf(memberId)).not.toContain(activeId);
  });

  it("refuses a request posted from another site", async () => {
    const response = await post(
      { favorite: true, gestureId: activeId },
      { cookie: memberCookie, origin: "https://evil.example" }
    );

    expect(response.status).toBe(403);
    expect(await favoritesOf(memberId)).not.toContain(activeId);
  });

  it("accepts one posted from this site", async () => {
    // The other half: an origin check that refused everything would pass the
    // test above and break every press.
    const response = await post(
      { favorite: false, gestureId: activeId },
      { cookie: memberCookie, origin: SITE }
    );

    expect(response.status).toBe(200);
  });

  it("stores relationship ids as numbers, which is what Payload will accept", async () => {
    /*
     * Verified at the call site rather than assumed, because every other
     * layer of this feature carries ids as strings and the failure is silent
     * until it is not. `isValidID(value, 'number')` requires
     * `typeof value === 'number'`, so `favorites: ["7"]` fails validation
     * with "invalid relationships" while `favorites: [7]` succeeds — this
     * asserts the second directly, so a refactor that stops converting fails
     * here rather than in a browser.
     */
    await expect(
      payload.update({
        collection: "users",
        data: { favorites: [activeId] as unknown as number[] },
        id: memberId,
      })
    ).rejects.toThrow();

    await expect(
      payload.update({
        collection: "users",
        data: { favorites: [Number(activeId)] },
        id: memberId,
      })
    ).resolves.toBeDefined();

    await setFavorite(activeId, false);
  });
});
