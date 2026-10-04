import { describe, expect, test } from "bun:test";
import type { UserRow } from "../src/core/export-schema";
import { legacyUuid } from "../src/core/ids";
import {
  normalizeEmail,
  resolveUsers,
  truncateText,
  usersTransform,
} from "../src/core/transform/users";
import {
  conflictProblems,
  fixtureContext,
  NOW,
  user,
} from "./transform-helpers";

function rowOf<T extends { legacyId?: string | null }>(
  rows: readonly T[],
  legacyId: string
): T | undefined {
  return rows.find((row) => row.legacyId === legacyId);
}

describe("the users transform", () => {
  test("skips guests and counts what they own; an upgraded guest is a real user", async () => {
    const result = await usersTransform(await fixtureContext());
    const legacyIds = result.rows.user.map((row) => row.legacyId);
    expect(legacyIds).not.toContain(user("gst1"));
    expect(legacyIds).toContain(user("upg1"));
    const counts = result.sections[0]?.counts ?? {};
    expect(counts.guestsSkipped).toBe(1);
    expect(counts.guestFavoritesSkipped).toBe(1);
    expect(counts.guestListsSkipped).toBe(1);
    expect(counts.guestListItemsSkipped).toBe(1);
    expect(counts.guestConsentsSkipped).toBe(1);
  });

  test("writes each row as ruling 8 says", async () => {
    const result = await usersTransform(await fixtureContext());
    const ada = rowOf(result.rows.user, user("ada1"));
    expect(ada).toEqual({
      banned: false,
      createdAt: new Date(1_735_689_600_000),
      email: "ada.fixture@example.test",
      emailVerified: true,
      id: await legacyUuid("user", user("ada1")),
      image: null,
      legacyId: user("ada1"),
      locale: null,
      name: "Adalinde Fixturova",
      role: "admin",
      updatedAt: new Date(1_738_368_000_000),
      welcomedAt: NOW,
    });
    // No Convex role: "user". No WorkOS name: "".
    const upgraded = rowOf(result.rows.user, user("upg1"));
    expect(upgraded?.role).toBe("user");
    expect(upgraded?.name).toBe("");
  });

  test("lets the WorkOS email win, fills a missing one, and drops a user with none", async () => {
    const withWorkos = await usersTransform(await fixtureContext());
    expect(rowOf(withWorkos.rows.user, user("dif1"))?.email).toBe(
      "new.fixture@example.test"
    );
    expect(rowOf(withWorkos.rows.user, user("noe1"))).toMatchObject({
      email: "recovered.fixture@example.test",
      name: "Rik Herstel",
    });
    expect(rowOf(withWorkos.rows.user, user("noe2"))).toBeUndefined();
    const counts = withWorkos.sections[0]?.counts ?? {};
    expect(counts.workosEmailDiffers).toBe(1);
    expect(counts.workosEmailFilled).toBe(1);
    expect(counts.noEmailDropped).toBe(1);
    const noEmail = withWorkos.sections[0]?.issues.find(
      (issue) => issue.code === "noEmail"
    );
    expect(noEmail).toMatchObject({ ids: [user("noe2")], severity: "warning" });
    expect(noEmail?.message).toContain(
      "losing 1 favorite(s), 0 list(s) with 0 item(s) and 0 consent row(s)"
    );

    const without = await usersTransform(
      await fixtureContext({ noWorkos: true })
    );
    expect(rowOf(without.rows.user, user("dif1"))?.email).toBe(
      "old.fixture@example.test"
    );
    expect(rowOf(without.rows.user, user("noe1"))).toBeUndefined();
    expect(without.sections[0]?.counts.noEmailDropped).toBe(2);
    expect(rowOf(without.rows.user, user("ada1"))?.name).toBe("");
  });

  test("trims and lower-cases emails, and counts private-relay addresses", async () => {
    expect(normalizeEmail("  Ada@Example.TEST ")).toBe("ada@example.test");
    expect(normalizeEmail("   ")).toBeNull();
    const result = await usersTransform(await fixtureContext());
    expect(result.sections[0]?.counts.privateRelay).toBe(1);
    expect(
      result.sections[0]?.issues.find((issue) => issue.code === "privateRelay")
    ).toMatchObject({ ids: [user("rel1")], severity: "info" });
  });

  test("merges duplicate emails into the oldest account, admin if either was", async () => {
    const context = await fixtureContext();
    const result = await usersTransform(context);
    expect(rowOf(result.rows.user, user("dup2"))).toBeUndefined();
    expect(rowOf(result.rows.user, user("dup1"))).toMatchObject({
      email: "dup.fixture@example.test",
      role: "admin",
      // The newest activity of the merged accounts.
      updatedAt: new Date(1_735_689_680_000 + 86_400_000),
    });
    const resolved = await resolveUsers(context);
    expect(resolved.byConvexId.get(user("dup2"))).toEqual({
      kind: "migrated",
      legacyId: user("dup1"),
    });
    expect(result.sections[0]?.counts.mergedDuplicates).toBe(1);
    expect(
      result.sections[0]?.issues.find(
        (issue) => issue.code === "duplicateEmail"
      )
    ).toMatchObject({
      details: [{ kept: user("dup1"), merged: user("dup2") }],
      severity: "warning",
    });
  });

  test("counts the admins, and blocks a plan that would leave none", async () => {
    const context = await fixtureContext();
    const result = await usersTransform(context);
    expect(result.sections[0]?.counts.admins).toBe(3);
    expect(result.sections[0]?.issues.map((issue) => issue.code)).not.toContain(
      "noAdmin"
    );
    const users = context.data.users.map(
      (row): UserRow => ({ ...row, role: "user" })
    );
    const blocked = await usersTransform({
      ...context,
      data: { ...context.data, users },
    });
    expect(blocked.sections[0]?.issues[0]).toMatchObject({
      code: "noAdmin",
      severity: "blocker",
    });
  });

  test("claims an existing account by email before inserting, and never touches role", async () => {
    const result = await usersTransform(await fixtureContext());
    expect(conflictProblems(result.statements)).toEqual([]);
    const id = await legacyUuid("user", user("pre1"));
    const index = result.statements.findIndex((statement) =>
      statement.includes("preexisting.admin@example.test")
    );
    expect(result.statements[index]).toBe(
      `UPDATE "user" SET "legacy_id" = '${user("pre1")}' WHERE "email" = 'preexisting.admin@example.test' AND "legacy_id" IS NULL;`
    );
    expect(result.statements[index + 1]).toStartWith(
      `INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "role", "banned", "locale", "legacy_id", "welcomed_at") VALUES ('${id}', `
    );
    expect(result.statements[index + 1]).toEndWith(
      ' ON CONFLICT ("legacy_id") DO NOTHING ON CONFLICT ("email") DO NOTHING;'
    );
    expect(result.statements).toHaveLength(2 * result.rows.user.length);
    expect(result.claims).toContainEqual({
      email: "preexisting.admin@example.test",
      legacyId: user("pre1"),
      role: "user",
    });
  });

  test("returns every migrated user as a reset key", async () => {
    const result = await usersTransform(await fixtureContext());
    expect(result.group).toBe("10-users");
    expect(result.resetKeys.users).toEqual(
      await Promise.all(
        result.rows.user.map(async (row) => ({
          id: await legacyUuid("user", row.legacyId ?? ""),
          legacyId: row.legacyId ?? "",
        }))
      )
    );
    // 11 rows: one guest, one without an email and one merged duplicate are not users.
    expect(result.resetKeys.users).toHaveLength(8);
  });

  test("pseudonymises addresses and names on staging, the claim too", async () => {
    const result = await usersTransform(
      await fixtureContext({ target: "staging" })
    );
    const production = await usersTransform(await fixtureContext());
    expect(result.rows.user).toHaveLength(production.rows.user.length);
    for (const [index, row] of result.rows.user.entries()) {
      expect(row.email).toBe(`${row.id}@staging.invalid`);
      expect(row.name).toBe(`Gebruiker ${index + 1}`);
    }
    const text = result.statements.join("\n");
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain("privaterelay");
    expect(text).not.toContain("Adalinde");
  });

  test("cuts a long WorkOS name to 80 characters", async () => {
    const context = await fixtureContext();
    const long = `${"A".repeat(50)} ${"B".repeat(50)}`;
    const result = await usersTransform({
      ...context,
      inputs: {
        ...context.inputs,
        workosUsers: [
          {
            email: null,
            firstName: "A".repeat(50),
            id: "user_01FIXTUREADA0000000000000",
            lastName: "B".repeat(50),
          },
        ],
      },
    });
    expect(rowOf(result.rows.user, user("ada1"))?.name).toBe(long.slice(0, 80));
    expect(truncateText("ab😀", 3)).toBe("ab");
    expect(truncateText("abc  def", 5)).toBe("abc");
  });
});
