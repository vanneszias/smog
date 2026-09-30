import { isContractProcedure } from "@orpc/contract";
import { call } from "@orpc/server";
import { makeRpcContext, makeSession } from "@smog/rpc/testing";
import { describe, expect, it } from "vitest";
import { appContract } from "../src/contract";
import { appRouter } from "../src/index";

/*
 * The authorization safety net (phase 3 review M11): every procedure of
 * `appContract` is classified here, and every one that needs a user
 * answers `UNAUTHORIZED` to an anonymous call. A new procedure fails this
 * test until it is added to one of the two lists, so a forgotten
 * `requireUser` cannot ship unnoticed.
 *
 * `admin.*` is the third class: every one needs the admin role, checked
 * here on the mounted router for every admin path. `adminProcedure`'s
 * guards run before input validation (oRPC validates after the
 * middlewares), so no input is needed. The admin package's own auth test
 * adds the admin's successful call, with inputs per area.
 */

const ADMIN_PREFIX = "admin.";

/** Anyone may call these (a new public procedure is a deliberate entry). */
const PUBLIC_PROCEDURES = [
  "gestures.byIds",
  "gestures.bySlug",
  "gestures.categories",
  "gestures.list",
  "gestures.related",
  "gestures.search",
  "gestures.sitemap",
  "lists.shared.get",
  "system.authConfig",
  "system.health",
  "system.whoami",
] as const;

/**
 * Every other procedure needs a session. Each has a valid input, so the
 * anonymous call passes the contract's input validation (which runs
 * first) and reaches the guard.
 */
const USER_PROCEDURES: Record<string, unknown> = {
  "account.consent.get": undefined,
  "account.consent.set": { analytics: true },
  "account.delete": { confirm: "DELETE" },
  "account.export": undefined,
  "account.importGuestData": { favorites: [], lists: [] },
  "account.me": undefined,
  "account.updateProfile": {},
  "favorites.add": { gestureId: "g" },
  "favorites.ids": undefined,
  "favorites.list": {},
  "favorites.remove": { gestureId: "g" },
  "favorites.toggle": { gestureId: "g" },
  "lists.addItem": { gestureId: "g", id: "l" },
  "lists.containing": { gestureId: "g" },
  "lists.create": { name: "Dieren" },
  "lists.delete": { id: "l" },
  "lists.get": { id: "l" },
  "lists.mine": undefined,
  "lists.removeItem": { gestureId: "g", id: "l" },
  "lists.reorder": { gestureIds: [], id: "l" },
  "lists.share.create": { id: "l", role: "view" },
  "lists.share.get": { id: "l" },
  "lists.share.revoke": { id: "l", role: "view" },
  "lists.shared.addItem": { gestureId: "g", token: "t" },
  "lists.shared.removeItem": { gestureId: "g", token: "t" },
  "lists.update": { id: "l", name: "Dieren" },
};

/** Every procedure path of a contract (`lists.share.create`, …). */
function procedurePaths(node: unknown, path: string[] = []): string[] {
  if (isContractProcedure(node)) {
    return [path.join(".")];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, child]) => procedurePaths(child, [...path, key])
  );
}

/** The router's procedure at `path`. */
function procedureAt(path: string): Parameters<typeof call>[0] {
  let node: unknown = appRouter;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  return node as Parameters<typeof call>[0];
}

describe("authorization matrix", () => {
  const paths = procedurePaths(appContract)
    .filter((path) => !path.startsWith(ADMIN_PREFIX))
    .sort();

  it("classifies every procedure of appContract as public or signed-in", () => {
    const publicPaths = new Set<string>(PUBLIC_PROCEDURES);
    const userPaths = new Set(Object.keys(USER_PROCEDURES));
    const unclassified = paths.filter(
      (path) => !(publicPaths.has(path) || userPaths.has(path))
    );
    expect(unclassified).toEqual([]);
    // No stale or double entries either.
    expect([...publicPaths].filter((path) => userPaths.has(path))).toEqual([]);
    expect(
      [...publicPaths, ...userPaths].filter((path) => !paths.includes(path))
    ).toEqual([]);
  });

  for (const [path, input] of Object.entries(USER_PROCEDURES)) {
    it(`${path} rejects an anonymous call`, async () => {
      await expect(
        call(procedureAt(path), input, { context: makeRpcContext() })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  }
});

describe("admin mount", () => {
  it("has admin procedures, each built by the admin router", () => {
    const admin = procedurePaths(appContract).filter((path) =>
      path.startsWith(ADMIN_PREFIX)
    );
    expect(admin).toContain("admin.dashboard");
    for (const path of admin) {
      expect(procedureAt(path), path).toBeDefined();
    }
  });

  for (const path of procedurePaths(appContract).filter((name) =>
    name.startsWith(ADMIN_PREFIX)
  )) {
    it(`${path} is UNAUTHORIZED for a guest and FORBIDDEN for a user`, async () => {
      await expect(
        call(procedureAt(path), undefined, {
          context: makeRpcContext(),
          path: path.split("."),
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        call(procedureAt(path), undefined, {
          context: makeRpcContext({ session: makeSession("user") }),
          path: path.split("."),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
});
