// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_LIST_ITEMS } from "@/lib/ownedLists";
import type { Gesture, List, User } from "@/payload-types";
import config from "../payload.config";

/**
 * The native app's six list writes, at `/api/mobile/lists/*`, driven through
 * `handleEndpoints` against a real database — the same harness
 * `lists.int.test.ts` uses, for the same reason: half of what can go wrong
 * here is routing and authentication, and a handler called with a hand-built
 * `req` exercises neither.
 *
 * **This file exists because `lists.int.test.ts` could not change.** The form
 * endpoints' `decide*` functions (`endpoints/lists.ts`) are shared with these;
 * that file's 47 tests, run unedited alongside this one, are what prove the
 * extraction changed no guard, no order and no answer for the web surface. What
 * this file adds is the second renderer: a JSON body instead of a 303, and
 * `Authorization: JWT …` instead of a cookie — the native app carries no cookie
 * jar at all.
 */

const RUN = crypto.randomUUID();
const PASSWORD = "mobile-lists-endpoint-password";
const SITE = "http://localhost:3003";

describe("the native app's list endpoints", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let owner: { token: string; user: User };
  let stranger: { token: string; user: User };
  let gesture: Gesture;
  let inactiveGesture: Gesture;
  let filler: number[];

  const signIn = async (email: string) => {
    const { token } = await payload.login({
      collection: "users",
      data: { email, password: PASSWORD },
    });

    if (token === undefined) {
      throw new Error("login issued no token");
    }

    return token;
  };

  const createMember = async (prefix: string) => {
    const email = `mobile-lists-${prefix}-${RUN}@example.test`;
    const user = (await payload.create({
      collection: "users",
      data: { email, password: PASSWORD, role: "user" },
    })) as User;

    return { token: await signIn(email), user };
  };

  /**
   * `Authorization: JWT …`, never a cookie — this is the one property this
   * file exists to exercise that `lists.int.test.ts` does not.
   */
  const post = (
    path: string,
    body: unknown,
    init: { origin?: string; token?: string } = {}
  ) => {
    const headers = new Headers({ "Content-Type": "application/json" });

    if (init.token !== undefined) {
      headers.set("Authorization", `JWT ${init.token}`);
    }

    if (init.origin !== undefined) {
      headers.set("Origin", init.origin);
    }

    return handleEndpoints({
      config,
      request: new Request(`${SITE}/api${path}`, {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
    });
  };

  const json = async (response: Response) =>
    (await response.json()) as Record<string, unknown>;

  const reload = async (id: number | string) =>
    (await payload.findByID({
      collection: "lists",
      depth: 0,
      id,
      overrideAccess: true,
    })) as List;

  const seedGesture = async (prefix: string, isActive: boolean) => {
    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Mobiele lijsten ${prefix} ${RUN}` },
    });

    return (await payload.create({
      collection: "gestures",
      data: {
        categories: [category.id],
        isActive,
        name: `Mobiel gebaar ${prefix} ${RUN}`,
        playbackId: `pb-mobile-lists-${prefix}-${RUN}`,
      },
    })) as Gesture;
  };

  const seedList = async (
    user: User,
    overrides: Record<string, unknown> = {}
  ) =>
    (await payload.create({
      collection: "lists",
      data: {
        name: `Mobiele lijst ${RUN} ${crypto.randomUUID()}`,
        owner: Number(user.id),
        visibility: "private",
        ...overrides,
      },
      overrideAccess: true,
    })) as List;

  beforeAll(async () => {
    payload = await getPayload({ config });

    owner = await createMember("owner");
    stranger = await createMember("stranger");

    gesture = await seedGesture("een", true);
    inactiveGesture = await seedGesture("uit", false);

    const fillerCategory = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Mobiele lijsten vulling ${RUN}` },
    });

    filler = [];
    for (let index = 0; index < MAX_LIST_ITEMS; index += 1) {
      const row = await payload.create({
        collection: "gestures",
        data: {
          categories: [fillerCategory.id],
          isActive: true,
          name: `Mobiele vulling ${index} ${RUN}`,
          playbackId: `pb-mobile-lists-vulling-${index}-${RUN}`,
        },
      });

      filler.push(row.id);
    }
  });

  afterAll(async () => {
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
      "/mobile/lists/create",
      "/mobile/lists/rename",
      "/mobile/lists/delete",
      "/mobile/lists/add",
      "/mobile/lists/remove",
      "/mobile/lists/share",
    ];

    it("refuses a cross-site post to every one of them", async () => {
      for (const path of PATHS) {
        const response = await post(
          path,
          { name: `Van elders ${RUN}` },
          { origin: "https://evil.example", token: owner.token }
        );

        expect(`${path}:${response.status}`).toBe(`${path}:403`);
      }
    });

    it("answers 401 signed-out for every one of them, with no session", async () => {
      for (const path of PATHS) {
        const response = await post(path, { name: `Zonder sessie ${RUN}` });

        expect(response.status).toBe(401);
        expect(await json(response)).toEqual({ status: "signed-out" });
      }
    });
  });

  describe("create", () => {
    it("creates the list, owned by the session, and answers its id", async () => {
      const response = await post(
        "/mobile/lists/create",
        { description: " Mijn omschrijving ", name: " Nieuw " },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.status).toBe("created");
      expect(typeof body.id).toBe("string");

      const list = await reload(body.id as string);

      expect(list.name).toBe("Nieuw");
      expect(list.description).toBe("Mijn omschrijving");
      expect(Number(list.owner)).toBe(Number(owner.user.id));

      await payload.delete({
        collection: "lists",
        id: body.id as string,
        overrideAccess: true,
      });
    });

    it("takes the owner from the session, not from the body", async () => {
      const response = await post(
        "/mobile/lists/create",
        { name: `Gestolen ${RUN}`, owner: String(stranger.user.id) },
        { token: owner.token }
      );

      const { id } = await json(response);
      const list = await reload(id as string);

      expect(Number(list.owner)).toBe(Number(owner.user.id));
    });

    it("refuses a blank name and creates nothing", async () => {
      const before = await payload.count({
        collection: "lists",
        overrideAccess: true,
        where: { owner: { equals: Number(owner.user.id) } },
      });

      const response = await post(
        "/mobile/lists/create",
        { name: "   " },
        { token: owner.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "name",
        status: "invalid",
      });

      const after = await payload.count({
        collection: "lists",
        overrideAccess: true,
        where: { owner: { equals: Number(owner.user.id) } },
      });
      expect(after.totalDocs).toBe(before.totalDocs);
    });
  });

  describe("rename", () => {
    it("renames a list the caller owns", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/rename",
        { id: String(list.id), name: "Herdoopt" },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "renamed" });
      expect((await reload(list.id)).name).toBe("Herdoopt");
    });

    it("refuses a list the caller does not own, and changes nothing", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/rename",
        { id: String(list.id), name: "Gestolen naam" },
        { token: stranger.token }
      );

      expect(response.status).toBe(404);
      expect(await json(response)).toEqual({ status: "unknown-list" });
      expect((await reload(list.id)).name).toBe(list.name);
    });

    it("refuses an unknown id", async () => {
      const response = await post(
        "/mobile/lists/rename",
        { id: "9999999999", name: "Onbestaand" },
        { token: owner.token }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("delete", () => {
    it("deletes the list once the name is confirmed", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/delete",
        { confirmName: list.name, id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "deleted" });

      const found = await payload.findByID({
        collection: "lists",
        disableErrors: true,
        id: list.id,
        overrideAccess: true,
      });
      expect(found).toBeNull();
    });

    it("refuses a confirmation that does not match, and deletes nothing", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/delete",
        { confirmName: "Verkeerd", id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "confirm",
        status: "invalid",
      });

      const found = await payload.findByID({
        collection: "lists",
        disableErrors: true,
        id: list.id,
        overrideAccess: true,
      });
      expect(found).not.toBeNull();

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });
  });

  describe("add", () => {
    it("adds the gesture", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/add",
        { gestureId: String(gesture.id), id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "added" });

      const reloaded = await reload(list.id);
      expect(
        (reloaded.items ?? []).map((item) => Number(item.gesture))
      ).toEqual([gesture.id]);

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });

    it("refuses a gesture that does not resolve — deactivated or unknown", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/add",
        { gestureId: String(inactiveGesture.id), id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "gesture",
        status: "invalid",
      });

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });

    /**
     * The app shows the limit before the request. This is the server side of
     * that — the bound is enforced here regardless of what the client showed,
     * and the mobile client must be able to read this refusal by name to show
     * the same message the cap-reached UI shows before the tap.
     */
    it("refuses to add past MAX_LIST_ITEMS, and adds nothing", async () => {
      const list = await seedList(owner.user, {
        items: filler.map((id) => ({ gesture: id })),
      });

      const response = await post(
        "/mobile/lists/add",
        { gestureId: String(gesture.id), id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(409);
      expect(await json(response)).toEqual({
        field: "full",
        status: "invalid",
      });

      const reloaded = await reload(list.id);
      expect(reloaded.items ?? []).toHaveLength(MAX_LIST_ITEMS);

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });
  });

  describe("remove", () => {
    it("removes the gesture", async () => {
      const list = await seedList(owner.user, {
        items: [{ gesture: gesture.id }],
      });

      const response = await post(
        "/mobile/lists/remove",
        { gestureId: String(gesture.id), id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "removed" });
      expect((await reload(list.id)).items ?? []).toEqual([]);

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });

    it("removes a deactivated gesture's row, which add would refuse to resolve", async () => {
      const list = await seedList(owner.user, {
        items: [{ gesture: inactiveGesture.id }],
      });

      const response = await post(
        "/mobile/lists/remove",
        { gestureId: String(inactiveGesture.id), id: String(list.id) },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect((await reload(list.id)).items ?? []).toEqual([]);

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });
  });

  describe("share", () => {
    it("shares the list", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/share",
        { id: String(list.id), visibility: "shared" },
        { token: owner.token }
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "shared" });
      expect((await reload(list.id)).visibility).toBe("shared");

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });

    it("refuses a third visibility value", async () => {
      const list = await seedList(owner.user);

      const response = await post(
        "/mobile/lists/share",
        { id: String(list.id), visibility: "public" },
        { token: owner.token }
      );

      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({
        field: "visibility",
        status: "invalid",
      });

      await payload.delete({
        collection: "lists",
        id: list.id,
        overrideAccess: true,
      });
    });
  });
});
