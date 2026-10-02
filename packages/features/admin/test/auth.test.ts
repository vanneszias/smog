import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Authed,
  adminProcedurePaths,
  callAs,
  type Fixtures,
  seedFixtures,
  signedUp,
} from "./helpers";
import { ADMIN_INPUTS } from "./inputs";

/*
 * Every admin procedure, enumerated from the contract (ruling 10): a guest
 * is `UNAUTHORIZED`, a user `FORBIDDEN`, and an admin's call succeeds. The
 * guards run before input validation (oRPC validates after the
 * middlewares), so the guest and user calls need no valid input; the admin
 * call gets one from `test/inputs/<area>.ts`. Because `adminProcedure`'s
 * guard fails a read that writes and a mutation that built no (or the
 * wrong) audit entry, a successful admin call here proves each mutation's
 * audit write through a real call.
 */

const paths = adminProcedurePaths();

/** The error code of a rejected call, or `null` when it resolved. */
async function outcome(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    const { code } = error as { code?: string };
    return code ?? String(error);
  }
}

describe("admin authorization", () => {
  let user: Authed;
  let fixtures: Fixtures;

  beforeAll(async () => {
    user = await signedUp("user");
    fixtures = await seedFixtures(await signedUp("admin"));
  });

  it("has an input for every admin procedure (and no stale ones)", () => {
    expect(paths.filter((path) => !Object.hasOwn(ADMIN_INPUTS, path))).toEqual(
      []
    );
    expect(
      Object.keys(ADMIN_INPUTS).filter((path) => !paths.includes(path))
    ).toEqual([]);
  });

  for (const path of paths) {
    it(`admin.${path}: guest UNAUTHORIZED, user FORBIDDEN, admin succeeds`, async () => {
      expect(await outcome(callAs(null, path))).toBe("UNAUTHORIZED");
      expect(await outcome(callAs(user, path))).toBe("FORBIDDEN");
      const input = await ADMIN_INPUTS[path]?.(fixtures);
      expect(await outcome(callAs(fixtures.admin, path, input))).toBeNull();
    });
  }

  it("a demoted admin's next call is FORBIDDEN with the same cookie", async () => {
    const demoted = await signedUp("admin");
    await expect(callAs(demoted, "dashboard")).resolves.toBeDefined();
    await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?")
      .bind(demoted.user.id)
      .run();
    await expect(callAs(demoted, "dashboard")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a promoted user's next call is allowed with the same cookie", async () => {
    const promoted = await signedUp("user");
    await expect(callAs(promoted, "dashboard")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(promoted.user.id)
      .run();
    await expect(callAs(promoted, "dashboard")).resolves.toBeDefined();
  });
});
