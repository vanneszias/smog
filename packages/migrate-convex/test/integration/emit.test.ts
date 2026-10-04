import { env } from "cloudflare:workers";
import { category, gesture, gestureCategory, user } from "@smog/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ftsRebuildStatements,
  insertRow,
  legacyIdRef,
  resetStatements,
} from "../../src/core/emit";
import { legacyUuid } from "../../src/core/ids";

/*
 * The emitter's SQL on a D1 with every migration (phase 8 task 5): the
 * core runs in workerd, and what it writes is valid SQLite for D1 — the
 * repeated `ON CONFLICT` clauses, `char(10)` line breaks, the legacy id
 * subqueries, the `json_each` reset deletes and the last-admin guard.
 */

const T0 = new Date(1_735_689_600_000);
const SLUG_TAKEN = /UNIQUE constraint failed: category\.slug/;

async function run(statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    // biome-ignore lint/performance/noAwaitInLoops: the statements depend on each other, in order (as `--file` runs them).
    await env.DB.prepare(statement).run();
  }
}

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM "${table}"`
  ).first<{ n: number }>();
  return row?.n ?? -1;
}

function userRow(
  id: string,
  legacyId: string,
  email: string,
  role: "admin" | "user"
) {
  return insertRow(
    user,
    {
      createdAt: T0,
      email,
      emailVerified: true,
      id,
      legacyId,
      name: "",
      role,
      updatedAt: T0,
      welcomedAt: T0,
    },
    [[user.legacyId], [user.email]]
  );
}

describe("the emitted SQL on D1", () => {
  beforeEach(async () => {
    await run(
      [
        'DELETE FROM "gesture_category"',
        'DELETE FROM "gesture"',
        'DELETE FROM "category"',
        'DELETE FROM "user"',
        "DELETE FROM gesture_fts",
      ].map((statement) => `${statement};`)
    );
  });

  it("inserts once, keeps line breaks and quotes, and links children by legacy id", async () => {
    const categoryId = await legacyUuid("category", "kc1");
    const gestureId = await legacyUuid("gesture", "kg1");
    const statements = [
      insertRow(
        category,
        {
          createdAt: T0,
          id: categoryId,
          legacyId: "kc1",
          name: "Familie",
          publishedAt: T0,
          slug: "familie",
          sortOrder: 0,
          updatedAt: T0,
        },
        [[category.legacyId]]
      ),
      insertRow(
        gesture,
        {
          createdAt: T0,
          description: "Regel één\nRegel 'twee'\r\nklaar",
          id: gestureId,
          legacyId: "kg1",
          name: "Mama",
          playbackId: "pb1",
          publishedAt: T0,
          slug: "mama",
          sortName: "mama",
          updatedAt: T0,
        },
        [[gesture.legacyId]]
      ),
      insertRow(
        gestureCategory,
        {
          categoryId: legacyIdRef("category", "kc1"),
          gestureId: legacyIdRef("gesture", "kg1"),
        },
        [[gestureCategory.gestureId, gestureCategory.categoryId]]
      ),
      ...ftsRebuildStatements([gestureId]),
    ];
    await run(statements);
    await run(statements);
    expect(await count("category")).toBe(1);
    expect(await count("gesture")).toBe(1);
    expect(await count("gesture_category")).toBe(1);
    const row = await env.DB.prepare(
      "SELECT description FROM gesture WHERE id = ?"
    )
      .bind(gestureId)
      .first<{ description: string }>();
    expect(row?.description).toBe("Regel één\nRegel 'twee'\r\nklaar");
    const fts = await env.DB.prepare(
      "SELECT gesture_id, categories FROM gesture_fts WHERE gesture_fts MATCH 'familie'"
    ).all();
    expect(fts.results).toEqual([
      { categories: "Familie", gesture_id: gestureId },
    ]);

    await run(
      resetStatements({
        rows: {
          category: [categoryId],
          gesture: [gestureId],
          gesture_category: [[gestureId, categoryId]],
        },
      })
    );
    expect(await count("category")).toBe(0);
    expect(await count("gesture")).toBe(0);
    expect(await count("gesture_fts")).toBe(0);
  });

  it("does nothing on a repeated email or legacy id, and fails loudly on another constraint", async () => {
    await run([userRow("u-1", "jd1", "ada@example.test", "user")]);
    await run([userRow("u-2", "jd2", "ada@example.test", "user")]);
    await run([userRow("u-3", "jd1", "bea@example.test", "user")]);
    expect(await count("user")).toBe(1);
    // A slug taken by another origin is not a named conflict target.
    await run([
      insertRow(
        category,
        { createdAt: T0, id: "c-native", name: "A", slug: "a", updatedAt: T0 },
        [[category.legacyId]]
      ),
    ]);
    await expect(
      run([
        insertRow(
          category,
          {
            createdAt: T0,
            id: "c-imported",
            legacyId: "kc9",
            name: "A",
            slug: "a",
            updatedAt: T0,
          },
          [[category.legacyId]]
        ),
      ])
    ).rejects.toThrow(SLUG_TAKEN);
  });

  it("deletes created users but never the last admin, and frees claimed accounts", async () => {
    const created = await legacyUuid("user", "jd-admin");
    const member = await legacyUuid("user", "jd-member");
    await run([
      userRow(created, "jd-admin", "admin@example.test", "admin"),
      userRow(member, "jd-member", "member@example.test", "user"),
      // A claimed account: its own id, the legacy id set by the claim.
      userRow("native-1", "jd-claimed", "claimed@example.test", "user"),
    ]);
    const keys = {
      users: [
        { id: created, legacyId: "jd-admin" },
        { id: member, legacyId: "jd-member" },
        { id: await legacyUuid("user", "jd-claimed"), legacyId: "jd-claimed" },
      ],
    };
    await run(resetStatements(keys));
    // The created admin is the only admin: kept (its legacy id is cleared).
    const left = await env.DB.prepare(
      'SELECT id, role, legacy_id FROM "user" ORDER BY id'
    ).all();
    expect(left.results).toEqual(
      [
        { id: created, legacy_id: null, role: "admin" },
        { id: "native-1", legacy_id: null, role: "user" },
      ].sort((a, b) => (a.id < b.id ? -1 : 1))
    );

    // With another admin present, the created admin goes.
    await run([
      'DELETE FROM "user";',
      userRow(created, "jd-admin", "admin@example.test", "admin"),
      userRow("native-admin", "jd-native", "seed@example.test", "admin"),
    ]);
    await run(
      resetStatements({ users: [{ id: created, legacyId: "jd-admin" }] })
    );
    const after = await env.DB.prepare('SELECT id FROM "user"').all();
    expect(after.results).toEqual([{ id: "native-admin" }]);
  });
});
