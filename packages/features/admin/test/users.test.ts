import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { createDb } from "@smog/db/client";
import { makeGesture, makeUser } from "@smog/db/testing";
import { newId } from "@smog/utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  AdminUser,
  AdminUserDetail,
  AdminUserPage,
  UserGuardReason,
} from "../src/schema";
import { userActionRefusal, userSponsorshipsQuery } from "../src/server/users";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  expectAudit,
  procedureAt,
  signedUp,
  testDb,
} from "./helpers";
import { seedCheckout } from "./sponsorship-helpers";

/*
 * `admin.users.*` over the test D1 with real Better Auth sessions: every
 * write goes through `auth.api` and then writes its audit entry (ruling 5),
 * the guards refuse before anything changes (ruling 7), and the list is a
 * real keyset over `created_at, id`.
 */

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

const DAY = 24 * 60 * 60 * 1000;
const AUDIT_INSERT = /insert into "audit_log"/i;

async function failure(
  run: Promise<unknown>
): Promise<{ code: string; data?: unknown }> {
  try {
    await run;
  } catch (error) {
    return error as { code: string; data?: unknown };
  }
  throw new Error("[test] expected the call to fail");
}

async function expectRefused(
  run: Promise<unknown>,
  reason: UserGuardReason
): Promise<void> {
  expect(await failure(run)).toMatchObject({
    code: "INVALID_STATE",
    data: { reason },
  });
}

/** The rpc context of `admin`, whose D1 refuses the `audit_log` insert. */
async function contextWithFailingAudit() {
  const context = await contextAs(admin);
  const failing = new Proxy(env.DB, {
    get(d1, key) {
      if (key === "prepare") {
        return (query: string) => {
          if (AUDIT_INSERT.test(query)) {
            throw new Error("audit_log is down");
          }
          return d1.prepare(query);
        };
      }
      const value: unknown = Reflect.get(d1, key, d1);
      return typeof value === "function" ? value.bind(d1) : value;
    },
  });
  return { ...context, db: createDb(failing) };
}

/**
 * Runs `admin.<path>` with an audit insert that fails, and asserts the
 * call failed and the writer logged the entry it could not write.
 */
async function expectAuditFailure(
  path: string,
  action: string,
  targetId: string,
  input: unknown
): Promise<void> {
  const context = await contextWithFailingAudit();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {
    // Silenced: asserted below.
  });
  try {
    await expect(
      call(procedureAt(path), input, {
        context,
        path: ["admin", ...path.split(".")],
      })
    ).rejects.toThrow();
    expect(
      logged.mock.calls.some(
        ([message]) =>
          typeof message === "string" &&
          message.startsWith(
            `[admin] Failed to write the audit entry ${action} for user:${targetId}`
          )
      )
    ).toBe(true);
  } finally {
    logged.mockRestore();
  }
}

/** The rpc context of `admin` with `auth.api.<method>` replaced. */
async function contextWithAuthApi(method: string, run: () => Promise<never>) {
  const context = await contextAs(admin);
  const api = new Proxy(context.auth.api, {
    get(target, key) {
      return key === method ? run : Reflect.get(target, key, target);
    },
  });
  return { ...context, auth: { ...context.auth, api } as typeof context.auth };
}

/** An error shaped like Better Auth's `APIError` (better-call). */
function apiError(statusCode: number, code: string): Error {
  return Object.assign(new Error(code), {
    body: { code, message: code },
    name: "APIError",
    status: code,
    statusCode,
  });
}

async function userRow(id: string) {
  return await env.DB.prepare(
    "SELECT role, banned, ban_reason AS banReason, ban_expires AS banExpires FROM user WHERE id = ?"
  )
    .bind(id)
    .first<{
      banExpires: number | null;
      banned: number | null;
      banReason: string | null;
      role: string;
    }>();
}

/** A unique word for the names of one test's accounts (`q` isolates them). */
function tag(): string {
  return `t${newId().slice(-10).toLowerCase()}`;
}

async function listAll(q: string, limit: number): Promise<AdminUser[]> {
  const items: AdminUser[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor.
    const result = await callAs<AdminUserPage>(admin, "users.list", {
      cursor,
      limit,
      q,
    });
    items.push(...result.items);
    if (!result.nextCursor) {
      return items;
    }
    cursor = result.nextCursor;
  }
  throw new Error("[test] the list never ended");
}

describe("admin.users.list", () => {
  it("pages newest first with a keyset over created_at and id", async () => {
    const word = tag();
    const at = Date.now() - 10 * DAY;
    const db = testDb();
    // Two accounts share a created_at: the id breaks the tie.
    const made = await Promise.all(
      [0, 1, 1, 2, 3].map(
        async (offset, index) =>
          await makeUser(db, {
            createdAt: new Date(at + offset * 1000),
            name: `${word} ${index}`,
          })
      )
    );
    const expected = [...made]
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (a.id < b.id ? 1 : -1)
      )
      .map((row) => row.id);
    const paged = await listAll(word, 2);
    expect(paged.map((row) => row.id)).toEqual(expected);
    expect(paged[0]).toMatchObject({
      banExpires: null,
      banned: false,
      banReason: null,
      emailVerified: false,
      role: "user",
    });
  });

  it("matches the email or the name, case-insensitively, with % and _ taken literally", async () => {
    const word = tag();
    const db = testDb();
    const percent = await makeUser(db, { name: `${word} 100% Zeker` });
    await makeUser(db, { name: `${word} 100x zeker` });
    const underscore = await makeUser(db, {
      email: `${word}_mail@smog.test`,
      name: "Underscore",
    });
    await makeUser(db, { email: `${word}xmail@smog.test`, name: "Other" });

    const byPercent = await callAs<AdminUserPage>(admin, "users.list", {
      q: `${word.toUpperCase()} 100% ZEKER`,
    });
    expect(byPercent.items.map((row) => row.id)).toEqual([percent.id]);

    const byUnderscore = await callAs<AdminUserPage>(admin, "users.list", {
      q: `${word}_MAIL`,
    });
    expect(byUnderscore.items.map((row) => row.id)).toEqual([underscore.id]);

    const none = await callAs<AdminUserPage>(admin, "users.list", {
      q: `${word}%\\`,
    });
    expect(none.items).toEqual([]);
  });

  it("finds a whole long email (D1 refuses LIKE patterns over 50 bytes)", async () => {
    const email = `e2e-${crypto.randomUUID()}-${tag()}@smog.test`;
    expect(email.length).toBeGreaterThan(50);
    const long = await makeUser(testDb(), { email });
    const page = await callAs<AdminUserPage>(admin, "users.list", {
      q: email.toUpperCase(),
    });
    expect(page.items.map((row) => row.id)).toEqual([long.id]);
  });

  it("filters by role and by a ban in force", async () => {
    const word = tag();
    const db = testDb();
    const promoted = await makeUser(db, { name: `${word} a`, role: "admin" });
    const banned = await makeUser(db, {
      banned: true,
      banReason: "Spam",
      name: `${word} b`,
    });
    const expired = await makeUser(db, {
      banExpires: new Date(Date.now() - DAY),
      banned: true,
      banReason: "Old",
      name: `${word} c`,
    });
    const plain = await makeUser(db, { name: `${word} d` });

    const ids = async (input: object) =>
      (
        await callAs<AdminUserPage>(admin, "users.list", { q: word, ...input })
      ).items
        .map((row) => row.id)
        .sort();

    expect(await ids({ role: "admin" })).toEqual([promoted.id]);
    expect(await ids({ banned: true })).toEqual([banned.id]);
    expect(await ids({ banned: false, role: "user" })).toEqual(
      [expired.id, plain.id].sort()
    );
    const page = await callAs<AdminUserPage>(admin, "users.list", {
      q: word,
    });
    expect(page.items.find((row) => row.id === expired.id)).toMatchObject({
      banned: false,
    });
  });

  it("refuses a foreign cursor (VALIDATION)", async () => {
    expect(
      await failure(callAs(admin, "users.list", { cursor: "not-a-cursor" }))
    ).toMatchObject({ code: "VALIDATION" });
  });
});

describe("admin.users.get", () => {
  it("finds the sponsors by the lower(email) index of migration 0010 (M2)", async () => {
    const query = userSponsorshipsQuery(testDb(), "u-1").toSQL();
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
      .bind(...query.params)
      .all<{ detail: string }>();
    const plan = results.map((row) => row.detail);
    expect(plan.some((step) => step.includes("sponsor_email_lower_idx"))).toBe(
      true
    );
    expect(plan.some((step) => step.startsWith("SCAN us"))).toBe(false);
  });

  it("returns the account with its methods and counts", async () => {
    const member = await signedUp("user", "Mia Member");
    const gesture = await makeGesture(testDb(), { name: "Users get gesture" });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO favorite (user_id, gesture_id, created_at) VALUES (?, ?, ?)"
      ).bind(member.user.id, gesture.id, Date.now()),
      env.DB.prepare(
        "INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES (?, ?, 'Les 1', ?, ?)"
      ).bind(newId(), member.user.id, Date.now(), Date.now()),
      env.DB.prepare(
        "INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(
        newId(),
        newId(),
        member.user.id,
        Date.now() - DAY,
        Date.now() - 2 * DAY,
        Date.now() - 2 * DAY
      ),
    ]);
    const detail = await callAs<AdminUserDetail>(admin, "users.get", {
      id: member.user.id,
    });
    expect(detail).toMatchObject({
      email: member.user.email,
      emailVerified: true,
      favorites: 1,
      id: member.user.id,
      lists: 1,
      methods: ["credential"],
      name: "Mia Member",
      role: "user",
      // The expired session does not count.
      sessions: 1,
    });
  });

  it("lists the sponsorships by the account's email, only once it is verified", async () => {
    const member = await signedUp("user", "Sam Sponsor");
    const older = await seedCheckout({
      createdAt: new Date(Date.now() - 2 * DAY),
      // Sponsors type their address: compared case-insensitively.
      email: member.user.email.toUpperCase(),
      status: "live",
    });
    const newer = await seedCheckout({
      createdAt: new Date(Date.now() - DAY),
      email: member.user.email,
    });
    await seedCheckout({ email: `other-${member.user.email}` });
    const detail = await callAs<AdminUserDetail>(admin, "users.get", {
      id: member.user.id,
    });
    expect(detail.sponsorships.map((row) => row.id)).toEqual([
      newer.sponsorshipIds[0],
      older.sponsorshipIds[0],
    ]);
    expect(detail.sponsorships[1]).toMatchObject({
      displayName: "Acme BV",
      gesture: { id: older.gestures[0]?.id, name: older.gestures[0]?.name },
      status: "live",
    });

    await env.DB.prepare("UPDATE user SET email_verified = 0 WHERE id = ?")
      .bind(member.user.id)
      .run();
    const unverified = await callAs<AdminUserDetail>(admin, "users.get", {
      id: member.user.id,
    });
    expect(unverified.sponsorships).toEqual([]);
  });

  it("is NOT_FOUND for an unknown account", async () => {
    expect(
      await failure(callAs(admin, "users.get", { id: "missing" }))
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin.users.setRole", () => {
  it("promotes through auth.api, audits { from, to }, and the next call has the role", async () => {
    const member = await signedUp("user");
    await expect(callAs(member, "dashboard")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const mark = await auditMark();
    const result = await callAs<{ user: AdminUser }>(admin, "users.setRole", {
      role: "admin",
      userId: member.user.id,
    });
    expect(result.user).toMatchObject({ id: member.user.id, role: "admin" });
    expect((await userRow(member.user.id))?.role).toBe("admin");
    await expectAudit("users.setRole", {
      actorId: admin.user.id,
      data: { from: "user", to: "admin" },
      mark,
      targetId: member.user.id,
      targetType: "user",
    });
    await expect(callAs(member, "dashboard")).resolves.toBeDefined();
  });

  it("demotes: the demoted admin's next admin call is FORBIDDEN", async () => {
    const other = await signedUp("admin", "Otto Other");
    await expect(callAs(other, "dashboard")).resolves.toBeDefined();
    const mark = await auditMark();
    await callAs(admin, "users.setRole", {
      role: "user",
      userId: other.user.id,
    });
    await expectAudit("users.setRole", {
      actorId: admin.user.id,
      data: { from: "admin", to: "user" },
      mark,
      targetId: other.user.id,
      targetType: "user",
    });
    await expect(callAs(other, "dashboard")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callAs(other, "users.list", {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses the admin's own role and an unchanged role, writing nothing", async () => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    await expectRefused(
      callAs(admin, "users.setRole", { role: "user", userId: admin.user.id }),
      "self"
    );
    await expectRefused(
      callAs(admin, "users.setRole", { role: "user", userId: target.id }),
      "unchanged"
    );
    expect((await userRow(admin.user.id))?.role).toBe("admin");
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("is NOT_FOUND for an unknown account", async () => {
    expect(
      await failure(
        callAs(admin, "users.setRole", { role: "admin", userId: "missing" })
      )
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  it("logs and rethrows a failed audit write after the role changed", async () => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    await expectAuditFailure("users.setRole", "user.role_change", target.id, {
      role: "admin",
      userId: target.id,
    });
    // The change came first (ruling 5): it happened, and the admin saw an error.
    expect((await userRow(target.id))?.role).toBe("admin");
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("refuses to promote an account whose ban is in force", async () => {
    const target = await makeUser(testDb(), { banned: true, banReason: "x" });
    await expectRefused(
      callAs(admin, "users.setRole", { role: "admin", userId: target.id }),
      "targetBanned"
    );
    expect((await userRow(target.id))?.role).toBe("user");
  });

  it("demotes an admin whose ban is in force", async () => {
    const target = await makeUser(testDb(), {
      banned: true,
      banReason: "x",
      role: "admin",
    });
    await callAs(admin, "users.setRole", { role: "user", userId: target.id });
    expect((await userRow(target.id))?.role).toBe("user");
  });
});

describe("the guards (ruling 7)", () => {
  const actorId = "actor";
  const plain = { bannedNow: false, id: "target", role: "user" as const };
  const otherAdmin = { ...plain, role: "admin" as const };

  it.each([
    [
      "own role",
      {
        action: "setRole",
        role: "user",
        target: { ...otherAdmin, id: actorId },
      },
      "self",
    ],
    ["own ban", { action: "ban", target: { ...plain, id: actorId } }, "self"],
    [
      "own delete",
      { action: "delete", target: { ...plain, id: actorId } },
      "self",
    ],
    [
      "same role",
      { action: "setRole", role: "user", target: plain },
      "unchanged",
    ],
    [
      "last admin",
      { action: "setRole", otherAdmins: 0, role: "user", target: otherAdmin },
      "lastAdmin",
    ],
    [
      "promote a banned account",
      {
        action: "setRole",
        role: "admin",
        target: { ...plain, bannedNow: true },
      },
      "targetBanned",
    ],
    ["ban an admin", { action: "ban", target: otherAdmin }, "adminTarget"],
    [
      "delete an admin",
      { action: "delete", target: otherAdmin },
      "adminTarget",
    ],
    [
      "ban twice",
      { action: "ban", target: { ...plain, bannedNow: true } },
      "alreadyBanned",
    ],
    ["unban without a ban", { action: "unban", target: plain }, "notBanned"],
  ] as const)("refuses %s", (_name, check, reason) => {
    expect(
      userActionRefusal({ actorId, otherAdmins: 1, ...check } as Parameters<
        typeof userActionRefusal
      >[0])
    ).toBe(reason);
  });

  it.each([
    ["promote", { action: "setRole", role: "admin", target: plain }],
    [
      "demote with another admin",
      { action: "setRole", otherAdmins: 1, role: "user", target: otherAdmin },
    ],
    ["ban", { action: "ban", target: plain }],
    [
      "demote a banned admin",
      {
        action: "setRole",
        otherAdmins: 1,
        role: "user",
        target: { ...otherAdmin, bannedNow: true },
      },
    ],
    ["unban", { action: "unban", target: { ...plain, bannedNow: true } }],
    ["delete", { action: "delete", target: plain }],
  ] as const)("allows %s", (_name, check) => {
    expect(
      userActionRefusal({ actorId, otherAdmins: 1, ...check } as Parameters<
        typeof userActionRefusal
      >[0])
    ).toBeNull();
  });
});

describe("admin.users.ban and unban", () => {
  it("bans with a reason and an end, revokes the sessions at once, and audits", async () => {
    const member = await signedUp("user");
    await expect(
      callAs(member, "dashboard").catch((error: { code: string }) => error.code)
    ).resolves.toBe("FORBIDDEN");
    const mark = await auditMark();
    const before = Date.now();
    const result = await callAs<{ user: AdminUser }>(admin, "users.ban", {
      expiresInDays: 7,
      reason: "  Spam in shared lists ",
      userId: member.user.id,
    });
    expect(result.user).toMatchObject({
      banned: true,
      banReason: "Spam in shared lists",
    });
    const row = await userRow(member.user.id);
    expect(row).toMatchObject({ banned: 1, banReason: "Spam in shared lists" });
    expect(row?.banExpires).toBeGreaterThanOrEqual(before + 7 * DAY - 1000);
    expect(row?.banExpires).toBeLessThanOrEqual(Date.now() + 7 * DAY + 1000);
    await expectAudit("users.ban", {
      actorId: admin.user.id,
      data: { expiresAt: row?.banExpires, reason: "Spam in shared lists" },
      mark,
      targetId: member.user.id,
      targetType: "user",
    });
    // The same cookie is now a guest's: the session rows are gone.
    expect(
      await member.auth.api.getSession({
        headers: new Headers({ cookie: member.cookie }),
      })
    ).toBeNull();
    await expect(callAs(member, "dashboard")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("bans without an end", async () => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    await callAs(admin, "users.ban", { reason: "Abuse", userId: target.id });
    expect((await userRow(target.id))?.banExpires).toBeNull();
    await expectAudit("users.ban", {
      actorId: admin.user.id,
      data: { expiresAt: null, reason: "Abuse" },
      mark,
      targetId: target.id,
      targetType: "user",
    });
  });

  it("refuses self, an admin and a second ban, writing nothing", async () => {
    const other = await signedUp("admin");
    const banned = await makeUser(testDb(), {
      banned: true,
      banReason: "Spam",
    });
    const mark = await auditMark();
    await expectRefused(
      callAs(admin, "users.ban", { reason: "x", userId: admin.user.id }),
      "self"
    );
    await expectRefused(
      callAs(admin, "users.ban", { reason: "x", userId: other.user.id }),
      "adminTarget"
    );
    await expectRefused(
      callAs(admin, "users.ban", { reason: "x", userId: banned.id }),
      "alreadyBanned"
    );
    expect((await userRow(other.user.id))?.banned).toBe(0);
    await expect(callAs(other, "dashboard")).resolves.toBeDefined();
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("unbans and audits; an account without a ban is refused", async () => {
    const target = await makeUser(testDb(), {
      banExpires: new Date(Date.now() + DAY),
      banned: true,
      banReason: "Spam",
    });
    const mark = await auditMark();
    const result = await callAs<{ user: AdminUser }>(admin, "users.unban", {
      userId: target.id,
    });
    expect(result.user).toMatchObject({ banned: false, banReason: null });
    expect(await userRow(target.id)).toMatchObject({
      banExpires: null,
      banned: 0,
      banReason: null,
    });
    await expectAudit("users.unban", {
      actorId: admin.user.id,
      data: {},
      mark,
      targetId: target.id,
      targetType: "user",
    });
    await expectRefused(
      callAs(admin, "users.unban", { userId: target.id }),
      "notBanned"
    );
  });

  it("is NOT_FOUND for an unknown account", async () => {
    expect(
      await failure(callAs(admin, "users.ban", { reason: "x", userId: "nope" }))
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await failure(callAs(admin, "users.unban", { userId: "nope" }))
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin.users.delete", () => {
  it("needs the email, then deletes with a cascade; the user's own audit rows keep a null actor", async () => {
    const member = await signedUp("user");
    const gesture = await makeGesture(testDb(), { name: "Users delete" });
    await env.DB.prepare(
      "INSERT INTO favorite (user_id, gesture_id, created_at) VALUES (?, ?, ?)"
    )
      .bind(member.user.id, gesture.id, Date.now())
      .run();
    // An entry the account wrote while it was an admin.
    const ownEntry = newId();
    await env.DB.prepare(
      "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, ?, 'user.unban', 'user', ?, '{}', ?)"
    )
      .bind(ownEntry, member.user.id, admin.user.id, Date.now())
      .run();

    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "users.delete", {
          confirmEmail: "someone-else@smog.test",
          userId: member.user.id,
        })
      )
    ).toMatchObject({ code: "VALIDATION" });
    expect(await userRow(member.user.id)).not.toBeNull();

    const result = await callAs<{ id: string }>(admin, "users.delete", {
      confirmEmail: ` ${member.user.email.toUpperCase()} `,
      userId: member.user.id,
    });
    expect(result).toEqual({ id: member.user.id });
    expect(await userRow(member.user.id)).toBeNull();
    const counts = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM favorite WHERE user_id = ?1) AS favorites, (SELECT count(*) FROM session WHERE user_id = ?1) AS sessions, (SELECT count(*) FROM account WHERE user_id = ?1) AS accounts"
    )
      .bind(member.user.id)
      .first();
    expect(counts).toEqual({ accounts: 0, favorites: 0, sessions: 0 });
    await expectAudit("users.delete", {
      actorId: admin.user.id,
      data: { hadSessions: true },
      mark,
      targetId: member.user.id,
      targetType: "user",
    });
    const own = await env.DB.prepare(
      "SELECT actor_id AS actorId FROM audit_log WHERE id = ?"
    )
      .bind(ownEntry)
      .first<{ actorId: string | null }>();
    expect(own).toEqual({ actorId: null });
    await expect(callAs(member, "dashboard")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses self and an admin, writing nothing", async () => {
    const other = await signedUp("admin");
    const mark = await auditMark();
    await expectRefused(
      callAs(admin, "users.delete", {
        confirmEmail: admin.user.email,
        userId: admin.user.id,
      }),
      "self"
    );
    await expectRefused(
      callAs(admin, "users.delete", {
        confirmEmail: other.user.email,
        userId: other.user.id,
      }),
      "adminTarget"
    );
    expect(await userRow(other.user.id)).not.toBeNull();
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("is NOT_FOUND for an unknown account", async () => {
    expect(
      await failure(
        callAs(admin, "users.delete", {
          confirmEmail: "x@smog.test",
          userId: "nope",
        })
      )
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("audit-write failures after the change (ruling 5)", () => {
  it("ban: the ban stands, the failure is logged and rethrown", async () => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    await expectAuditFailure("users.ban", "user.ban", target.id, {
      reason: "Spam",
      userId: target.id,
    });
    expect((await userRow(target.id))?.banned).toBe(1);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("unban: the ban is lifted, the failure is logged and rethrown", async () => {
    const target = await makeUser(testDb(), { banned: true, banReason: "x" });
    const mark = await auditMark();
    await expectAuditFailure("users.unban", "user.unban", target.id, {
      userId: target.id,
    });
    expect((await userRow(target.id))?.banned).toBe(0);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("delete: the account is gone, the failure is logged and rethrown", async () => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    await expectAuditFailure("users.delete", "user.delete", target.id, {
      confirmEmail: target.email,
      userId: target.id,
    });
    expect(await userRow(target.id)).toBeNull();
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});

describe("Better Auth's refusals are typed, not a 500", () => {
  it.each([
    [403, "YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE", { code: "FORBIDDEN" }],
    [404, "USER_NOT_FOUND", { code: "NOT_FOUND" }],
    [
      400,
      "YOU_CANNOT_BAN_YOURSELF",
      { code: "INVALID_STATE", data: { reason: "self" } },
    ],
    [400, "SOMETHING_ELSE", { code: "BAD_REQUEST" }],
  ] as const)("an APIError %i %s", async (status, code, expected) => {
    const target = await makeUser(testDb());
    const mark = await auditMark();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: the refusal is logged.
    });
    try {
      const context = await contextWithAuthApi("setRole", () =>
        Promise.reject(apiError(status, code))
      );
      await expect(
        call(
          procedureAt("users.setRole"),
          { role: "admin", userId: target.id },
          { context, path: ["admin", "users", "setRole"] }
        )
      ).rejects.toMatchObject(expected);
    } finally {
      logged.mockRestore();
    }
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("the last-admin trigger's abort is INVALID_STATE lastAdmin", async () => {
    const target = await makeUser(testDb());
    // What D1 raises when migration 0007's trigger aborts the update.
    const context = await contextWithAuthApi("setRole", () =>
      Promise.reject(
        new Error("D1_ERROR: last_admin: SQLITE_CONSTRAINT", {
          cause: new Error("last_admin"),
        })
      )
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced.
    });
    try {
      await expect(
        call(
          procedureAt("users.setRole"),
          { role: "admin", userId: target.id },
          { context, path: ["admin", "users", "setRole"] }
        )
      ).rejects.toMatchObject({
        code: "INVALID_STATE",
        data: { reason: "lastAdmin" },
      });
    } finally {
      logged.mockRestore();
    }
  });
});

describe("privacy of the ban reason", () => {
  it("deleting the account removes the reason from its ban entries", async () => {
    const target = await makeUser(testDb());
    await callAs(admin, "users.ban", {
      reason: "Stuurde berichten naar jan@example.com",
      userId: target.id,
    });
    await callAs(admin, "users.unban", { userId: target.id });
    await callAs(admin, "users.delete", {
      confirmEmail: target.email,
      userId: target.id,
    });
    const { results } = await env.DB.prepare(
      "SELECT data FROM audit_log WHERE action = 'user.ban' AND target_id = ?"
    )
      .bind(target.id)
      .all<{ data: string }>();
    expect(results.map((row) => JSON.parse(row.data))).toEqual([
      { expiresAt: null, reasonRemoved: true },
    ]);
  });
});

describe("search beyond ASCII (documented behaviour)", () => {
  it("matches non-ASCII letters as typed, and folds case for ASCII only", async () => {
    const word = tag();
    const emile = await makeUser(testDb(), { name: `Émile ${word}` });
    const ids = async (q: string) =>
      (await callAs<AdminUserPage>(admin, "users.list", { q })).items.map(
        (row) => row.id
      );
    expect(await ids(`Émile ${word}`)).toEqual([emile.id]);
    expect(await ids(`émile ${word.toUpperCase()}`)).toEqual([]);
    expect(await ids(`ÉMILE ${word}`)).toEqual([]);
    expect(await ids(`mile ${word.toUpperCase()}`)).toEqual([emile.id]);
  });
});
