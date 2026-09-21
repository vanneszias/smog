// @vitest-environment node
import { getPayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { List, User } from "@/payload-types";
import config from "../payload.config";
import { fetchOwnedList, fetchOwnedLists } from "./ownedLists";

/**
 * The owner's reads, against a real database.
 *
 * `ownedLists.test.ts` pins the shape of the query. This file is the half
 * that shape exists for: what the database answers when the caller is
 * somebody other than the list's owner.
 *
 * The administrator cases are the reason the owner clause is in the query at
 * all. `listReadAccess` returns `true` for `role: "admin"`, so with the
 * clause removed an admin's `/nl/account/lists` would list every list in the
 * database under "Mijn lijsten" and `/nl/account/lists/<a member's id>` would
 * open with a rename box and a delete box on it. No unit test can see that,
 * because the unit test's `find` is a stub that ignores access entirely.
 */

/*
 * Every fixture value that lands on a collision-prone column carries this.
 * `.wrangler/state/vitest` is never cleared between runs, and a collision
 * throws inside `beforeAll` — which Vitest reports as *skipped* rather than
 * failed, i.e. a green run that tested nothing.
 */
const RUN = crypto.randomUUID();

const PASSWORD = "correct-horse-battery-staple";

describe("the owner's list reads against a real database", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let owner: User;
  let stranger: User;
  let admin: User;
  let ownersList: List;
  let strangersList: List;

  const member = async (prefix: string, role: "admin" | "user") =>
    (await payload.create({
      collection: "users",
      data: {
        email: `owned-${prefix}-${RUN}@example.test`,
        password: PASSWORD,
        role,
      },
    })) as User;

  const listFor = async (user: User, name: string) =>
    (await payload.create({
      collection: "lists",
      data: {
        name: `${name} ${RUN}`,
        owner: Number(user.id),
        visibility: "private",
      },
      overrideAccess: true,
    })) as List;

  beforeAll(async () => {
    payload = await getPayload({ config });

    owner = await member("owner", "user");
    stranger = await member("stranger", "user");
    admin = await member("admin", "admin");

    ownersList = await listFor(owner, "Lijst van de eigenaar");
    strangersList = await listFor(stranger, "Lijst van een ander");
  });

  afterAll(async () => {
    await payload.delete({
      collection: "lists",
      where: { name: { like: RUN } },
    });
    await payload.delete({
      collection: "users",
      where: { email: { like: RUN } },
    });
  });

  describe("the index", () => {
    it("shows the owner their own list", async () => {
      const lists = await fetchOwnedLists({
        locale: "nl",
        payload,
        user: owner,
      });

      expect(lists.map((list) => list.id)).toContain(ownersList.id);
    });

    it("does not show the owner somebody else's list", async () => {
      const lists = await fetchOwnedLists({
        locale: "nl",
        payload,
        user: owner,
      });

      expect(lists.map((list) => list.id)).not.toContain(strangersList.id);
    });

    it("does not show an administrator other people's lists", async () => {
      /*
       * The one `listReadAccess` allows and this page must not. An admin is
       * not the owner of this surface; the admin panel is where a list that
       * is not yours is edited.
       */
      const lists = await fetchOwnedLists({
        locale: "nl",
        payload,
        user: admin,
      });

      expect(lists.map((list) => list.id)).not.toContain(ownersList.id);
      expect(lists.map((list) => list.id)).not.toContain(strangersList.id);
    });

    it("still shows an administrator the lists they own themselves", async () => {
      // The positive half. Without it, "an admin sees nothing" would also
      // satisfy the assertion above — a page that is broken for admins is not
      // the same as a page that is scoped for them.
      const adminsList = await listFor(admin, "Lijst van de beheerder");

      const lists = await fetchOwnedLists({
        locale: "nl",
        payload,
        user: admin,
      });

      expect(lists.map((list) => list.id)).toContain(adminsList.id);
    });
  });

  describe("one list", () => {
    const open = (user: User, id: number | string) =>
      fetchOwnedList({ depth: 1, id: String(id), locale: "nl", payload, user });

    it("opens the owner's own list", async () => {
      expect((await open(owner, ownersList.id))?.id).toBe(ownersList.id);
    });

    it("does not open somebody else's list for a member", async () => {
      expect(await open(owner, strangersList.id)).toBeNull();
    });

    it("does not open a member's list for an administrator", async () => {
      expect(await open(admin, ownersList.id)).toBeNull();
    });

    it("opens an administrator's own list for them", async () => {
      // Again the positive half, so "an admin can open nothing" cannot pass
      // for "an admin is scoped to their own".
      const adminsList = await listFor(admin, "Eigen lijst van de beheerder");

      expect((await open(admin, adminsList.id))?.id).toBe(adminsList.id);
    });

    it("answers null for an id that names no list at all", async () => {
      expect(await open(owner, 999_000_001)).toBeNull();
    });

    it("answers the same null for an id that is not a row id", async () => {
      // The two refusals the whole surface keeps indistinguishable.
      expect(await open(owner, "not-an-id")).toBeNull();
    });
  });
});
