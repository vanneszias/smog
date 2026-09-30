import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN_SLICES } from "../src/contract";
import { type Authed, adminProcedurePaths, callAs, signedUp } from "./helpers";
import { ADMIN_INPUTS } from "./inputs";

/*
 * Every admin procedure, enumerated from the contract (ruling 10): a guest
 * is `UNAUTHORIZED`, a user `FORBIDDEN`, an admin passes the guard. A new
 * procedure fails here until `test/inputs/<area>.ts` gives it a valid
 * input (input validation runs before the guard, so an invalid input
 * would prove nothing).
 */

const paths = adminProcedurePaths();
const READS = new Set<string>(
  Object.values(ADMIN_SLICES).flatMap((slice) => [...slice.auditMap.reads])
);
const GUARD_CODES = ["UNAUTHORIZED", "FORBIDDEN"];

/** Row counts of every table, to show a read changes nothing. */
async function tableCounts(): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all<{ name: string }>();
  const counts: Record<string, number> = {};
  for (const { name } of results) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of tables, read in order.
    const row = await env.DB.prepare(
      `SELECT count(*) AS n FROM "${name}"`
    ).first<{ n: number }>();
    counts[name] = row?.n ?? 0;
  }
  return counts;
}

/** The error code of a rejected call, or `null` when it resolved. */
async function outcome(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("admin authorization", () => {
  let user: Authed;
  let admin: Authed;

  beforeAll(async () => {
    user = await signedUp("user");
    admin = await signedUp("admin");
  });

  it("has a valid input for every admin procedure (and no stale ones)", () => {
    expect(paths.filter((path) => !Object.hasOwn(ADMIN_INPUTS, path))).toEqual(
      []
    );
    expect(
      Object.keys(ADMIN_INPUTS).filter((path) => !paths.includes(path))
    ).toEqual([]);
  });

  for (const path of paths) {
    it(`admin.${path}: guest UNAUTHORIZED, user FORBIDDEN, admin allowed`, async () => {
      const input = ADMIN_INPUTS[path];
      expect(await outcome(callAs(null, path, input))).toBe("UNAUTHORIZED");
      expect(await outcome(callAs(user, path, input))).toBe("FORBIDDEN");
      const before = READS.has(path) ? await tableCounts() : null;
      const code = await outcome(callAs(admin, path, input));
      expect(GUARD_CODES).not.toContain(code);
      // Input validation already passed for the guest; so it does here.
      expect(code).not.toBe("BAD_REQUEST");
      if (before) {
        expect(await tableCounts(), "a read changes nothing").toEqual(before);
      }
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
