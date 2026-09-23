// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_LIST_ITEMS } from "@/lib/ownedLists";
import type { Gesture, List, User } from "@/payload-types";
import config from "../payload.config";

/**
 * The owner's list endpoints, driven through `handleEndpoints` against a real
 * database.
 *
 * `handleEndpoints` rather than the handlers directly, for the reason
 * `auth.int.test.ts`, `account.int.test.ts` and `favorites.int.test.ts` all
 * give: half of what can go wrong here is routing and authentication, and a
 * handler called with a hand-built `req` exercises neither. The session goes
 * in as a `Cookie` header and Payload's own strategies resolve it.
 *
 * Two properties this file exists for above all others:
 *
 * 1. **The UI does not walk around the list access rules.** A signed-in
 *    stranger, an administrator and the holder of an edit share link each try
 *    every write here, and each is refused — by `listUpdateAccess`,
 *    `listDeleteAccess` and the owner filter in `lib/ownedLists.ts`, none of
 *    which these endpoints reimplement.
 * 2. **Every write is safe to re-run.** There are no transactions on any
 *    write path in this project, so a double-submitted form, a back button
 *    and a reload are
 *    all the normal case rather than the exception.
 */

const RUN = crypto.randomUUID();
const PASSWORD = "lists-endpoint-password";
const SITE = "http://localhost:3003";

describe("the owner's list endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let owner: { cookie: string; user: User };
  let stranger: { cookie: string; user: User };
  let admin: { cookie: string; user: User };
  let gesture: Gesture;
  let otherGesture: Gesture;
  let inactiveGesture: Gesture;
  /**
   * `MAX_LIST_ITEMS` real gestures, for the two tests about the bound.
   *
   * Real ones, because the obvious shortcut does not work:
   * `lists_items.gesture_id` carries a foreign key, so filler rows pointing
   * at ids nothing owns are refused by D1 with `FOREIGN KEY constraint
   * failed` — which is itself worth knowing, and is recorded on the lookup in
   * `endpoints/lists.ts`. Created once in `beforeAll` and shared, because
   * fifty creates cost about four seconds and no test body may take that
   * long.
   */
  let filler: number[];

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

  const createMember = async (prefix: string, role: "admin" | "user") => {
    const email = `lists-${prefix}-${RUN}@example.test`;
    const user = (await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role },
    })) as User;

    return { cookie: await signIn(email), user };
  };

  const post = (
    path: string,
    fields: Record<string, string>,
    init: { cookie?: string; origin?: string; query?: string } = {}
  ) => {
    const headers = new Headers({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    if (init.cookie !== undefined) {
      headers.set("Cookie", init.cookie);
    }

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}/api${path}${init.query ?? ""}`, {
        body: new URLSearchParams(fields).toString(),
        headers,
        method: "POST",
      }),
    });
  };

  /** A list belonging to `user`, created straight through the Local API. */
  const seedList = async (
    user: User,
    overrides: Record<string, unknown> = {}
  ) =>
    (await payload.create({
      collection: "lists",
      data: {
        name: `Lijst ${RUN} ${crypto.randomUUID()}`,
        owner: Number(user.id),
        visibility: "private",
        ...overrides,
      },
      overrideAccess: true,
    })) as List;

  /** The list as the database holds it. */
  const reload = async (id: number | string) =>
    (await payload.findByID({
      collection: "lists",
      depth: 0,
      id,
      overrideAccess: true,
    })) as List;

  /** Whether the list is still there at all. */
  const exists = async (id: number | string) =>
    (await payload.findByID({
      collection: "lists",
      depth: 0,
      disableErrors: true,
      id,
      overrideAccess: true,
    })) !== null;

  const gestureIdsOn = (list: List) =>
    (list.items ?? []).map((item) => Number(item.gesture));

  const seedGesture = async (prefix: string, isActive: boolean) => {
    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Lijsten ${prefix} ${RUN}` },
    });

    return (await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive,
        name: `Gebaar ${prefix} ${RUN}`,
        playbackId: `pb-lists-${prefix}-${RUN}`,
      },
    })) as Gesture;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    owner = await createMember("owner", "user");
    stranger = await createMember("stranger", "user");
    admin = await createMember("admin", "admin");

    gesture = await seedGesture("een", true);
    otherGesture = await seedGesture("twee", true);
    inactiveGesture = await seedGesture("uit", false);

    const fillerCategory = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Lijsten vulling ${RUN}` },
    });

    filler = [];
    for (let index = 0; index < MAX_LIST_ITEMS; index += 1) {
      const row = await payload.create({
        collection: "gestures",
        data: {
          categories: [fillerCategory.id],
          isActive: true,
          name: `Vulling ${index} ${RUN}`,
          playbackId: `pb-lists-vulling-${index}-${RUN}`,
        },
      });

      filler.push(row.id);
    }
  });

  afterAll(async () => {
    /*
     * Lists first: Payload emits `lists_items.gesture_id` as `NOT NULL` with
     * `ON DELETE set null`, so deleting a gesture a list row points at fails
     * with a raw SQL error and leaves the rest behind.
     */
    await payload.delete({
      collection: "lists",
      where: { name: { like: RUN } },
    });
    await payload.delete({
      collection: "gestures",
      where: { playbackId: { like: RUN } },
    });
    await payload.delete({
      collection: "categories",
      where: { name: { like: RUN } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { like: RUN } },
    });
  });

  describe("the doors every handler has", () => {
    const PATHS = [
      "/account/lists/create",
      "/account/lists/rename",
      "/account/lists/delete",
      "/account/lists/add",
      "/account/lists/remove",
      "/account/lists/share",
    ];

    it("refuses a cross-site post to every one of them", async () => {
      for (const path of PATHS) {
        const response = await post(
          path,
          { locale: "nl", name: `Van elders ${RUN}` },
          { cookie: owner.cookie, origin: "https://evil.example" }
        );

        expect(`${path}:${response.status}`).toBe(`${path}:403`);
      }
    });

    it("sends a caller with no session to sign in, from every one of them", async () => {
      for (const path of PATHS) {
        const response = await post(path, {
          locale: "nl",
          name: `Zonder sessie ${RUN}`,
        });

        expect(`${path}:${response.headers.get("Location")}`).toBe(
          `${path}:/nl/sign-in`
        );
      }
    });

    it("creates nothing when the post came from another site", async () => {
      // The status alone would pass against a handler that refused *after*
      // writing. Nothing was created, which is the property.
      const before = await payload.count({
        collection: "lists",
        overrideAccess: true,
        where: { name: { like: `Van elders ${RUN}` } },
      });

      expect(before.totalDocs).toBe(0);
    });
  });

  describe("creating a list", () => {
    it("creates it, owned by the session, and lands on its page", async () => {
      const response = await post(
        "/account/lists/create",
        { description: " Mijn omschrijving ", locale: "nl", name: " Nieuw " },
        { cookie: owner.cookie }
      );

      const location = response.headers.get("Location") ?? "";
      expect(response.status).toBe(303);
      expect(location).toMatch(/^\/nl\/account\/lists\/\d+\?notice=created$/);

      const id = Number(location.split("/")[4]?.split("?")[0]);
      const list = await reload(id);

      // Trimmed, so a stray space cannot make two lists that look identical.
      expect(list.name).toBe("Nieuw");
      expect(list.description).toBe("Mijn omschrijving");
      expect(Number(list.owner)).toBe(Number(owner.user.id));

      await payload.delete({ collection: "lists", id, overrideAccess: true });
    });

    it("takes the owner from the session and not from the form", async () => {
      /*
       * `lists.access.create` is `isAuthenticated`, which asks only that
       * somebody is signed in — it has no opinion about whose name goes on
       * the row. A believed `owner` field is a list planted in a stranger's
       * account, and they cannot tell it from their own.
       */
      const response = await post(
        "/account/lists/create",
        {
          locale: "nl",
          name: `Gestolen ${RUN}`,
          owner: String(stranger.user.id),
        },
        { cookie: owner.cookie }
      );

      const id = Number(
        (response.headers.get("Location") ?? "").split("/")[4]?.split("?")[0]
      );

      expect(Number((await reload(id)).owner)).toBe(Number(owner.user.id));
    });

    it("creates a private list however hard the form asks for a shared one", async () => {
      // A list created shared would hand out a live capability URL for
      // content the owner has not put in it yet.
      const response = await post(
        "/account/lists/create",
        { locale: "nl", name: `Meteen gedeeld ${RUN}`, visibility: "shared" },
        { cookie: owner.cookie }
      );

      const id = Number(
        (response.headers.get("Location") ?? "").split("/")[4]?.split("?")[0]
      );

      expect((await reload(id)).visibility).toBe("private");
    });

    it("refuses a blank name and creates nothing", async () => {
      const before = await payload.count({
        collection: "lists",
        overrideAccess: true,
        where: { owner: { equals: Number(owner.user.id) } },
      });

      const response = await post(
        "/account/lists/create",
        { locale: "nl", name: "   " },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=name"
      );

      const after = await payload.count({
        collection: "lists",
        overrideAccess: true,
        where: { owner: { equals: Number(owner.user.id) } },
      });
      expect(after.totalDocs).toBe(before.totalDocs);
    });

    it("refuses a name longer than a name may be", async () => {
      const response = await post(
        "/account/lists/create",
        { locale: "nl", name: "x".repeat(121) },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=name"
      );
    });

    it("accepts a name of exactly the maximum length", async () => {
      // The positive half of the bound. `> MAX` and `>= MAX` both refuse 121
      // characters; only this tells them apart.
      const name = `${"y".repeat(120 - RUN.length - 1)} ${RUN}`;

      const response = await post(
        "/account/lists/create",
        { locale: "nl", name },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toMatch(/\?notice=created$/);
    });

    it("refuses a description longer than a description may be", async () => {
      const response = await post(
        "/account/lists/create",
        {
          description: "x".repeat(2001),
          locale: "nl",
          name: `Lange omschrijving ${RUN}`,
        },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=description"
      );
    });
  });

  describe("renaming a list", () => {
    it("renames it", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/rename",
        {
          description: "Nu met omschrijving",
          id: String(list.id),
          locale: "nl",
          name: `Hernoemd ${RUN}`,
        },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=renamed`
      );

      const after = await reload(list.id);
      expect(after.name).toBe(`Hernoemd ${RUN}`);
      expect(after.description).toBe("Nu met omschrijving");
    });

    it("clears a description when the box is emptied", async () => {
      const list = await seedList(owner.user, { description: "Weg hiermee" });

      await post(
        "/account/lists/rename",
        { description: "", id: String(list.id), locale: "nl", name: list.name },
        { cookie: owner.cookie }
      );

      expect((await reload(list.id)).description).toBeNull();
    });

    it("refuses a blank name and leaves the old one standing", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/rename",
        { id: String(list.id), locale: "nl", name: "  " },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=name`
      );
      expect((await reload(list.id)).name).toBe(list.name);
    });

    it("refuses to rename a list that belongs to somebody else", async () => {
      const list = await seedList(stranger.user);

      const response = await post(
        "/account/lists/rename",
        { id: String(list.id), locale: "nl", name: `Gekaapt ${RUN}` },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect((await reload(list.id)).name).toBe(list.name);
    });

    it("refuses an administrator the same way, on this surface", async () => {
      /*
       * Not a hole in `listUpdateAccess` — an admin is allowed to edit any
       * list, through the admin panel. This surface is the owner's, and a
       * page headed "Mijn lijsten" that renames a member's list is a
       * different thing from the admin panel doing it.
       */
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/rename",
        { id: String(list.id), locale: "nl", name: `Door beheerder ${RUN}` },
        { cookie: admin.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect((await reload(list.id)).name).toBe(list.name);
    });

    it("refuses the holder of an edit share link, token and all", async () => {
      /*
       * The "a UI quietly bypasses an access rule" case, aimed at the widest
       * door the list access rules open: `listUpdateAccess` lets a request
       * carrying a valid `editShareToken` update a list whose
       * `allowSharedEditing` is on, *including* a signed-in one. The owner
       * filter in `lib/ownedLists.ts` is what keeps that capability out of this
       * surface, and the token is presented here exactly as the access rule
       * would want to read it.
       */
      const list = await seedList(owner.user, {
        allowSharedEditing: true,
        visibility: "shared",
      });
      const token = (await reload(list.id)).editShareToken ?? "";
      expect(token).not.toBe("");

      const response = await post(
        "/account/lists/rename",
        { id: String(list.id), locale: "nl", name: `Via de link ${RUN}` },
        {
          cookie: stranger.cookie,
          query: `?shareToken=${encodeURIComponent(token)}`,
        }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect((await reload(list.id)).name).toBe(list.name);
    });

    it("answers a list that is not yours exactly as it answers one that does not exist", async () => {
      /*
       * The property a timing floor would have been standing in for, and the
       * reason `endpoints/lists.ts` does not have one: the two refusals are
       * one code path, so they are the same bytes rather than merely the
       * same wording. List ids are consecutive integers; a difference here
       * would enumerate every list in the table.
       */
      const list = await seedList(stranger.user);

      const notYours = await post(
        "/account/lists/rename",
        { id: String(list.id), locale: "nl", name: `Poging ${RUN}` },
        { cookie: owner.cookie }
      );
      const nowhere = await post(
        "/account/lists/rename",
        { id: "999000001", locale: "nl", name: `Poging ${RUN}` },
        { cookie: owner.cookie }
      );

      expect(nowhere.status).toBe(notYours.status);
      expect(nowhere.headers.get("Location")).toBe(
        notYours.headers.get("Location")
      );
      expect(await nowhere.text()).toBe(await notYours.text());
    });

    it("answers an id that is not a row id the same way again", async () => {
      const response = await post(
        "/account/lists/rename",
        { id: "not-an-id", locale: "nl", name: `Poging ${RUN}` },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
    });
  });

  describe("deleting a list", () => {
    it("deletes it when the name is typed", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/delete",
        { confirmName: list.name, id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?notice=deleted"
      );
      expect(await exists(list.id)).toBe(false);
    });

    it("accepts the name in another case and with stray spaces", async () => {
      const list = await seedList(owner.user);

      await post(
        "/account/lists/delete",
        {
          confirmName: `  ${list.name.toUpperCase()} `,
          id: String(list.id),
          locale: "nl",
        },
        { cookie: owner.cookie }
      );

      expect(await exists(list.id)).toBe(false);
    });

    it("refuses a mistyped name, and the list survives", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/delete",
        { confirmName: `x${list.name}`, id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=confirm`
      );
      expect(await exists(list.id)).toBe(true);
    });

    it("refuses an empty confirmation, and the list survives", async () => {
      // The blank field is the case a missing check looks like from the
      // outside: a form posted with the input deleted sends `""`.
      const list = await seedList(owner.user);

      await post(
        "/account/lists/delete",
        { confirmName: "", id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(await exists(list.id)).toBe(true);
    });

    it("refuses to delete somebody else's list even with its name typed right", async () => {
      const list = await seedList(stranger.user);

      const response = await post(
        "/account/lists/delete",
        { confirmName: list.name, id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect(await exists(list.id)).toBe(true);
    });

    it("refuses an administrator on this surface too", async () => {
      const list = await seedList(owner.user);

      await post(
        "/account/lists/delete",
        { confirmName: list.name, id: String(list.id), locale: "nl" },
        { cookie: admin.cookie }
      );

      expect(await exists(list.id)).toBe(true);
    });

    it("gives the holder of an edit share link no way to delete", async () => {
      // `listDeleteAccess` deliberately has no token path at all — unlike
      // update. This asserts the endpoint has not quietly added one.
      const list = await seedList(owner.user, {
        allowSharedEditing: true,
        visibility: "shared",
      });
      const token = (await reload(list.id)).editShareToken ?? "";

      await post(
        "/account/lists/delete",
        { confirmName: list.name, id: String(list.id), locale: "nl" },
        {
          cookie: stranger.cookie,
          query: `?shareToken=${encodeURIComponent(token)}`,
        }
      );

      expect(await exists(list.id)).toBe(true);
    });
  });

  describe("adding a gesture", () => {
    it("puts it on the list and stamps who added it", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=added`
      );

      const after = await reload(list.id);
      expect(gestureIdsOn(after)).toEqual([gesture.id]);
      expect(Number(after.items?.[0]?.addedBy)).toBe(Number(owner.user.id));
    });

    it("stores the gesture as a number, not as the string the form carried", async () => {
      /*
       * `isValidID` requires `typeof value === 'number'` for a numeric key,
       * so a string id fails validation rather than being coerced — and
       * every other layer of this feature carries ids as strings.
       */
      const list = await seedList(owner.user);

      await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(typeof (await reload(list.id)).items?.[0]?.gesture).toBe("number");
    });

    it("is idempotent: adding the same gesture twice leaves one of it, and writes once", async () => {
      // There are no transactions, and a double-submitted form is the normal
      // case rather than the exception.
      const list = await seedList(owner.user);
      const body = {
        gestureId: String(gesture.id),
        id: String(list.id),
        locale: "nl",
      };

      const first = await post("/account/lists/add", body, {
        cookie: owner.cookie,
      });
      const settled = await reload(list.id);

      const second = await post("/account/lists/add", body, {
        cookie: owner.cookie,
      });

      expect(second.headers.get("Location")).toBe(
        first.headers.get("Location")
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([gesture.id]);
      /*
       * **`updatedAt` is what separates the endpoint's guard from the array
       * hook's.** Both leave one row, so the assertion above passes with
       * either one of them removed. Only this one sees the difference: the
       * hook cleans the array on the way to the database, having already
       * deleted and re-inserted every row to get there, while the branch in
       * `endpoints/lists.ts` does not write at all. Without this line the
       * branch is decorative — a mutation sweep proved exactly that before
       * it was added.
       */
      expect((await reload(list.id)).updatedAt).toBe(settled.updatedAt);
    });

    it("keeps the order gestures were added in", async () => {
      const list = await seedList(owner.user);

      for (const id of [otherGesture.id, gesture.id]) {
        await post(
          "/account/lists/add",
          { gestureId: String(id), id: String(list.id), locale: "nl" },
          { cookie: owner.cookie }
        );
      }

      expect(gestureIdsOn(await reload(list.id))).toEqual([
        otherGesture.id,
        gesture.id,
      ]);
    });

    it("keeps an earlier row's addedBy when a later gesture is added", async () => {
      /*
       * The write resends `items` whole with no `addedBy` on the rows that
       * were already there, and `Lists.ts`'s array hook carries provenance
       * forward for exactly that shape. Sending an explicit `addedBy: null`
       * instead would be honoured as a deliberate clear, so this is the
       * assertion that keeps the omission deliberate.
       */
      const list = await seedList(owner.user);

      await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );
      await post(
        "/account/lists/add",
        {
          gestureId: String(otherGesture.id),
          id: String(list.id),
          locale: "nl",
        },
        { cookie: owner.cookie }
      );

      const after = await reload(list.id);
      expect(Number(after.items?.[0]?.addedBy)).toBe(Number(owner.user.id));
    });

    it("refuses a gesture id that names no gesture, and writes no dangling row", async () => {
      /*
       * "A relationship field accepts an id for a row that does not exist":
       * `isValidID` is a `typeof` test, no query and no existence
       * check, so without the lookup this write would store a reference to a
       * gesture that never existed.
       */
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/add",
        { gestureId: "999000001", id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=gesture`
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([]);
    });

    it("refuses a gesture an editor has deactivated", async () => {
      // The second property the lookup buys: it runs `publicReadActive`, so
      // a gesture nobody may see cannot be put on a list.
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/add",
        {
          gestureId: String(inactiveGesture.id),
          id: String(list.id),
          locale: "nl",
        },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=gesture`
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([]);
    });

    it("refuses a gesture id that is not a row id", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/add",
        { gestureId: "1; drop table", id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=gesture`
      );
    });

    it("refuses a gesture id that merely starts with one", async () => {
      /*
       * **This is what the endpoint leans on instead of an id screen**, and
       * it is pinned here because it is a property of Payload rather than of
       * this code. `findByID` refuses `12abc` outright — measured, not
       * assumed — where `parseFloat`, which is what `sanitizeQueryValue`
       * applies inside a `where` clause, would read it as `12`. If a Payload
       * upgrade ever loosened `findByID` to match, an id that resolves as one
       * gesture would be stored by `Number` as `NaN`, and the visitor would
       * get a validation failure where every other refusal here is a
       * sentence. That is the day this test fails and the screen comes back.
       */
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/add",
        {
          gestureId: `${gesture.id}abc`,
          id: String(list.id),
          locale: "nl",
        },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=gesture`
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([]);
    });

    it("refuses to add to somebody else's list", async () => {
      const list = await seedList(stranger.user);

      const response = await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([]);
    });

    /** A list of `owner`'s holding the first `count` filler gestures. */
    const listHolding = async (count: number) => {
      const list = await seedList(owner.user);

      await payload.update({
        collection: "lists",
        data: {
          items: filler.slice(0, count).map((id) => ({ gesture: id })),
        },
        id: list.id,
        overrideAccess: true,
      });

      return list;
    };

    it("refuses a gesture once the list is full", async () => {
      const list = await listHolding(MAX_LIST_ITEMS);
      expect((await reload(list.id)).items).toHaveLength(MAX_LIST_ITEMS);

      const response = await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=full`
      );
      expect((await reload(list.id)).items).toHaveLength(MAX_LIST_ITEMS);
    });

    it("still accepts a gesture one short of the bound", async () => {
      // The positive half: an off-by-one bound refuses this too, and nothing
      // above would notice.
      const list = await listHolding(MAX_LIST_ITEMS - 1);

      const response = await post(
        "/account/lists/add",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=added`
      );
      expect((await reload(list.id)).items).toHaveLength(MAX_LIST_ITEMS);
    });
  });

  describe("removing a gesture", () => {
    const withItems = async (ids: number[]) => {
      const list = await seedList(owner.user);

      await payload.update({
        collection: "lists",
        data: { items: ids.map((id) => ({ gesture: id })) },
        id: list.id,
        overrideAccess: true,
      });

      return list;
    };

    it("takes it off", async () => {
      const list = await withItems([gesture.id, otherGesture.id]);

      const response = await post(
        "/account/lists/remove",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=removed`
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([otherGesture.id]);
    });

    it("is idempotent: removing it again changes nothing, and writes nothing", async () => {
      const list = await withItems([gesture.id, otherGesture.id]);
      const body = {
        gestureId: String(gesture.id),
        id: String(list.id),
        locale: "nl",
      };

      const first = await post("/account/lists/remove", body, {
        cookie: owner.cookie,
      });
      const settled = await reload(list.id);

      const second = await post("/account/lists/remove", body, {
        cookie: owner.cookie,
      });

      expect(second.headers.get("Location")).toBe(
        first.headers.get("Location")
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([otherGesture.id]);
      /*
       * `updatedAt` is what makes "wrote nothing" an assertion rather than a
       * claim. Re-sending the identical array would store the identical
       * array — every other assertion here would pass — while deleting and
       * re-inserting every row of the list to arrive at it.
       */
      expect((await reload(list.id)).updatedAt).toBe(settled.updatedAt);
    });

    it("takes off a gesture that has since been deactivated", async () => {
      /*
       * The row the owner most wants gone, and the one an existence check on
       * the way out would make unremovable: `publicReadActive` refuses it, so
       * it does not populate on the page and would not resolve here either.
       * Removal works from the stored ids for exactly this reason.
       */
      const list = await withItems([inactiveGesture.id, gesture.id]);

      await post(
        "/account/lists/remove",
        {
          gestureId: String(inactiveGesture.id),
          id: String(list.id),
          locale: "nl",
        },
        { cookie: owner.cookie }
      );

      expect(gestureIdsOn(await reload(list.id))).toEqual([gesture.id]);
    });

    it("refuses to take a gesture off somebody else's list", async () => {
      const list = await seedList(stranger.user);

      await payload.update({
        collection: "lists",
        data: { items: [{ gesture: gesture.id }] },
        id: list.id,
        overrideAccess: true,
      });

      const response = await post(
        "/account/lists/remove",
        { gestureId: String(gesture.id), id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([gesture.id]);
    });

    it("refuses a gesture id that is not a row id", async () => {
      const list = await withItems([gesture.id]);

      const response = await post(
        "/account/lists/remove",
        { gestureId: "abc", id: String(list.id), locale: "nl" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=gesture`
      );
      expect(gestureIdsOn(await reload(list.id))).toEqual([gesture.id]);
    });
  });

  describe("sharing and un-sharing", () => {
    it("shares a list and leaves the link it already had", async () => {
      const list = await seedList(owner.user);
      const before = await reload(list.id);

      const response = await post(
        "/account/lists/share",
        { id: String(list.id), locale: "nl", visibility: "shared" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=shared`
      );

      const after = await reload(list.id);
      expect(after.visibility).toBe("shared");
      expect(after.viewShareToken).toBe(before.viewShareToken);
    });

    it("un-shares a list and kills the link that was out there", async () => {
      /*
       * Un-sharing revokes by rotation — chosen over folding `visibility` into
       * the access filters, because two mechanisms that can disagree is the
       * worse option. The property is not that the column flipped: it is that
       * the link somebody already has stops resolving.
       */
      const list = await seedList(owner.user, { visibility: "shared" });
      const token = (await reload(list.id)).viewShareToken ?? "";
      expect(token).not.toBe("");

      const reachable = async () =>
        (
          await payload.find({
            collection: "lists",
            disableErrors: true,
            overrideAccess: false,
            req: { searchParams: new URLSearchParams({ shareToken: token }) },
            where: { viewShareToken: { equals: token } },
          })
        ).docs.length;

      expect(await reachable()).toBe(1);

      const response = await post(
        "/account/lists/share",
        { id: String(list.id), locale: "nl", visibility: "private" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?notice=unshared`
      );
      expect(await reachable()).toBe(0);

      const after = await reload(list.id);
      expect(after.visibility).toBe("private");
      // Rotated, not cleared: the owner still has a link to re-share with.
      expect(after.viewShareToken).not.toBe(token);
      expect(after.viewShareToken).not.toBeNull();
    });

    it("refuses a visibility the column does not have", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/account/lists/share",
        { id: String(list.id), locale: "nl", visibility: "public" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        `/nl/account/lists/${list.id}?error=visibility`
      );
      expect((await reload(list.id)).visibility).toBe("private");
    });

    it("refuses to share somebody else's list", async () => {
      const list = await seedList(stranger.user);

      const response = await post(
        "/account/lists/share",
        { id: String(list.id), locale: "nl", visibility: "shared" },
        { cookie: owner.cookie }
      );

      expect(response.headers.get("Location")).toBe(
        "/nl/account/lists?error=unknown"
      );
      expect((await reload(list.id)).visibility).toBe("private");
    });

    it("gives the holder of an edit share link no way to un-share", async () => {
      /*
       * Rotation is the owner's revocation switch. An anonymous or signed-in
       * editor who could flip `visibility` could rotate the owner's tokens at
       * will — and `isListOwnerField` does not stop it, because the hook
       * writes the tokens after field access has run. The owner filter is
       * what stops it.
       */
      const list = await seedList(owner.user, {
        allowSharedEditing: true,
        visibility: "shared",
      });
      const token = (await reload(list.id)).editShareToken ?? "";

      await post(
        "/account/lists/share",
        { id: String(list.id), locale: "nl", visibility: "private" },
        {
          cookie: stranger.cookie,
          query: `?shareToken=${encodeURIComponent(token)}`,
        }
      );

      const after = await reload(list.id);
      expect(after.visibility).toBe("shared");
      expect(after.editShareToken).toBe(token);
    });
  });
});
