import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  signedUp,
} from "./helpers";

/*
 * Ruling 7 made atomic (migration 0007, `user_keep_one_admin`): a role
 * change never leaves the site without an admin whose ban is not in force,
 * whatever runs it (Better Auth, `admin:grant`, raw SQL), and two admins
 * demoting each other at once cannot both win. Each test starts with no
 * accounts, so the admins it makes are the only ones.
 */

const LAST_ADMIN = /last_admin/;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM user").run();
});

async function activeAdmins(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM user WHERE role = 'admin' AND NOT (coalesce(banned, 0) = 1 AND (ban_expires IS NULL OR ban_expires > ?))"
  )
    .bind(Date.now())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function demote(id: string): Promise<unknown> {
  return await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?")
    .bind(id)
    .run();
}

async function ban(id: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE user SET banned = 1, ban_reason = 'x', ban_expires = NULL WHERE id = ?"
  )
    .bind(id)
    .run();
}

describe("the user_keep_one_admin trigger", () => {
  it("aborts a raw demotion of the last admin, and allows it with another one", async () => {
    const only = await signedUp("admin");
    await expect(demote(only.user.id)).rejects.toThrow(LAST_ADMIN);
    expect(await activeAdmins()).toBe(1);

    const second = await signedUp("admin");
    await demote(only.user.id);
    expect(await activeAdmins()).toBe(1);
    await expect(demote(second.user.id)).rejects.toThrow(LAST_ADMIN);
  });

  it("does not count an admin whose ban is in force", async () => {
    const active = await signedUp("admin");
    const banned = await signedUp("admin");
    await ban(banned.user.id);
    await expect(demote(active.user.id)).rejects.toThrow(LAST_ADMIN);
    // The banned admin can be demoted: an active one stays.
    await demote(banned.user.id);
    expect(await activeAdmins()).toBe(1);
  });

  it("leaves other updates of an admin row alone", async () => {
    const only = await signedUp("admin");
    await env.DB.prepare("UPDATE user SET name = 'Nieuwe naam' WHERE id = ?")
      .bind(only.user.id)
      .run();
    await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?")
      .bind(only.user.id)
      .run();
    expect(await activeAdmins()).toBe(1);
  });
});

describe("two admins demoting each other at once", () => {
  async function outcome(run: Promise<unknown>) {
    try {
      await run;
      return { ok: true as const };
    } catch (error) {
      const { code, data } = error as { code?: string; data?: unknown };
      return { code, data, ok: false as const };
    }
  }

  it("exactly one wins; the other is refused and writes nothing", async () => {
    const a: Authed = await signedUp("admin", "Ada");
    const b: Authed = await signedUp("admin", "Bas");
    const mark = await auditMark();
    const results = await Promise.all([
      outcome(callAs(a, "users.setRole", { role: "user", userId: b.user.id })),
      outcome(callAs(b, "users.setRole", { role: "user", userId: a.user.id })),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const [refused] = results.filter((result) => !result.ok);
    // Refused by the trigger (both passed every read), or by Better Auth's
    // own role check when the winner's write landed before the loser's call.
    expect([
      JSON.stringify({ code: "INVALID_STATE", data: { reason: "lastAdmin" } }),
      JSON.stringify({ code: "FORBIDDEN" }),
    ]).toContain(
      JSON.stringify(
        refused?.code === "FORBIDDEN"
          ? { code: refused.code }
          : { code: refused?.code, data: refused?.data }
      )
    );
    expect(await activeAdmins()).toBe(1);
    const rows = (await auditRowsSince(mark)).filter(
      (row) => row.action === "user.role_change"
    );
    expect(rows).toHaveLength(1);
  });

  it("the read guard counts only admins in good standing", async () => {
    const a = await signedUp("admin", "Ada");
    const b = await signedUp("admin", "Bas");
    // B is banned (its session kept here on purpose): A is the only admin
    // in good standing, so B cannot demote A.
    await ban(b.user.id);
    const mark = await auditMark();
    await expect(
      callAs(b, "users.setRole", { role: "user", userId: a.user.id })
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "lastAdmin" },
    });
    expect(await activeAdmins()).toBe(1);
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});
