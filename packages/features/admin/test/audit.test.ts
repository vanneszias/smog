import { env } from "cloudflare:workers";
import { auditLog, gesture } from "@smog/db";
import { makeUser } from "@smog/db/testing";
import { encodeCursor } from "@smog/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry, AuditPage } from "../src/schema";
import { AuditDataError, auditStatement, writeAudit } from "../src/server";
import { auditEntriesQuery } from "../src/server/audit";
import { type Authed, callAs, signedUp, testDb } from "./helpers";

async function auditCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM audit_log"
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

interface SeedRow {
  action?: string;
  actorId: string | null;
  createdAt: number;
  data?: unknown;
  targetId?: string | null;
  targetType?: string;
}

/** Inserts audit rows straight into D1 (any action, any time). */
async function seed(rows: readonly SeedRow[]): Promise<string[]> {
  const ids = rows.map(() => crypto.randomUUID());
  await env.DB.batch(
    rows.map((row, index) =>
      env.DB.prepare(
        "INSERT INTO audit_log (id, actor_id, action, target_type, target_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        ids[index],
        row.actorId,
        row.action ?? "legacy",
        row.targetType ?? "gesture",
        row.targetId === undefined ? "g-1" : row.targetId,
        JSON.stringify(row.data ?? { legacy: { note: index } }),
        row.createdAt
      )
    )
  );
  return ids;
}

async function list(
  as: Authed,
  input: Record<string, unknown>
): Promise<AuditPage> {
  return await callAs<AuditPage>(as, "audit.list", input);
}

const ids = (items: readonly AuditEntry[]): string[] =>
  items.map((item) => item.id);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auditStatement", () => {
  it("throws on data its action's schema rejects, before anything is written", async () => {
    const actor = await makeUser(testDb());
    const before = await auditCount();
    expect(() =>
      auditStatement(testDb(), {
        action: "legacy",
        actorId: actor.id,
        // @ts-expect-error: `legacy` data is `{ legacy: unknown }`.
        data: "not an object",
        targetId: "g-1",
        targetType: "gesture",
      })
    ).toThrow(AuditDataError);
    expect(await auditCount()).toBe(before);
  });

  it("refuses an action without a data schema", () => {
    expect(() =>
      auditStatement(testDb(), {
        // @ts-expect-error: only actions with a schema are writable.
        action: "sponsorship.approve",
        actorId: "someone",
        data: { legacy: 1 },
        targetId: "s-1",
        targetType: "sponsorship",
      })
    ).toThrow(AuditDataError);
  });

  it("is written in the same batch as the change", async () => {
    const db = testDb();
    const actor = await makeUser(db);
    const before = await auditCount();
    await db.batch([
      auditStatement(db, {
        action: "legacy",
        actorId: actor.id,
        data: { legacy: { from: "test" } },
        targetId: "g-batch",
        targetType: "gesture",
      }),
    ]);
    expect(await auditCount()).toBe(before + 1);
    const row = await db.query.auditLog.findFirst({
      where: (table, { eq }) => eq(table.targetId, "g-batch"),
    });
    expect(row).toMatchObject({
      action: "legacy",
      actorId: actor.id,
      data: { legacy: { from: "test" } },
      targetType: "gesture",
    });
  });

  it("a batch with a failing statement leaves neither the change nor the entry", async () => {
    const db = testDb();
    const actor = await makeUser(db);
    const before = await auditCount();
    const name = `Batch ${crypto.randomUUID()}`;
    await expect(
      db.batch([
        db.insert(gesture).values({
          id: crypto.randomUUID(),
          name,
          playbackId: "p",
          slug: `slug-${crypto.randomUUID()}`,
          sortName: name.toLowerCase(),
        }),
        auditStatement(db, {
          action: "legacy",
          actorId: actor.id,
          data: { legacy: null },
          targetId: "g-fail",
          targetType: "gesture",
        }),
        // The audit id is fresh, so this duplicate primary key fails the batch.
        db.insert(auditLog).values({
          action: "legacy",
          actorId: actor.id,
          data: { legacy: null },
          id: "duplicate",
          targetType: "gesture",
        }),
        db.insert(auditLog).values({
          action: "legacy",
          actorId: actor.id,
          data: { legacy: null },
          id: "duplicate",
          targetType: "gesture",
        }),
      ])
    ).rejects.toThrow();
    expect(await auditCount()).toBe(before);
    const kept = await env.DB.prepare(
      "SELECT count(*) AS n FROM gesture WHERE name = ?"
    )
      .bind(name)
      .first<{ n: number }>();
    expect(kept?.n).toBe(0);
  });
});

describe("writeAudit", () => {
  it("writes one entry", async () => {
    const actor = await makeUser(testDb());
    const before = await auditCount();
    await writeAudit(testDb(), {
      action: "legacy",
      actorId: actor.id,
      data: { legacy: 1 },
      targetId: "setting-key",
      targetType: "setting",
    });
    expect(await auditCount()).toBe(before + 1);
  });

  it("logs and rethrows a failed write (after an external change)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: the failure is the point of this test.
    });
    await expect(
      writeAudit(testDb(), {
        action: "legacy",
        // No such user: the foreign key fails the insert.
        actorId: "no-such-user",
        data: { legacy: 1 },
        targetId: "u-1",
        targetType: "user",
      })
    ).rejects.toThrow();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("[admin] Failed to write the audit entry legacy"),
      expect.anything()
    );
  });
});

describe("admin.audit.list", () => {
  it("lists newest first, a keyset page at a time, ties broken by id", async () => {
    const admin = await signedUp("admin");
    const actor = await makeUser(testDb(), { name: "Keyset Actor" });
    const seeded = await seed([
      { actorId: actor.id, createdAt: 1000 },
      { actorId: actor.id, createdAt: 2000 },
      { actorId: actor.id, createdAt: 2000 },
      { actorId: actor.id, createdAt: 3000 },
      { actorId: actor.id, createdAt: 4000 },
    ]);
    const [a, b, c, d, e] = seeded as [string, string, string, string, string];
    const tied = [b, c].sort().reverse();
    const expected = [e, d, ...tied, a];

    const pages: string[][] = [];
    let cursor: string | undefined;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: pages follow each other.
      const page = await list(admin, { actorId: actor.id, cursor, limit: 2 });
      pages.push(ids(page.items));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(pages.flat()).toEqual(expected);
  });

  it("filters by action, target, actor and time range", async () => {
    const admin = await signedUp("admin");
    const one = await makeUser(testDb(), { name: "One" });
    const two = await makeUser(testDb(), { name: "Two" });
    const target = crypto.randomUUID();
    const [oldest, middle, newest, other] = (await seed([
      { actorId: one.id, createdAt: 10_000, targetId: target },
      {
        action: "maintenance.enable",
        actorId: one.id,
        createdAt: 20_000,
        data: { message: "Soon" },
        targetId: "maintenance",
        targetType: "setting",
      },
      { actorId: two.id, createdAt: 30_000, targetId: target },
      { actorId: two.id, createdAt: 40_000, targetId: "elsewhere" },
    ])) as [string, string, string, string];

    const byActor = await list(admin, { actorId: one.id });
    expect(ids(byActor.items)).toEqual([middle, oldest]);

    const byTarget = await list(admin, {
      targetId: target,
      targetType: "gesture",
    });
    expect(ids(byTarget.items)).toEqual([newest, oldest]);

    const byAction = await list(admin, {
      action: "maintenance.enable",
      actorId: one.id,
    });
    expect(ids(byAction.items)).toEqual([middle]);

    const byType = await list(admin, { actorId: two.id, targetType: "user" });
    expect(byType.items).toEqual([]);

    const range = await list(admin, {
      from: 20_000,
      targetType: "gesture",
      to: 40_000,
    });
    expect(ids(range.items)).toContain(newest);
    expect(ids(range.items)).toContain(other);
    expect(ids(range.items)).not.toContain(oldest);
    expect(
      range.items.every(
        (item) => item.createdAt >= 20_000 && item.createdAt <= 40_000
      )
    ).toBe(true);
  });

  it("parses data with its action's schema, and returns it raw otherwise", async () => {
    const admin = await signedUp("admin");
    const actor = await makeUser(testDb(), { name: "Data Actor" });
    const [legacy, unknown] = (await seed([
      { actorId: actor.id, createdAt: 50_000, data: { legacy: { a: 1 } } },
      {
        action: "sponsorship.approve",
        actorId: actor.id,
        createdAt: 60_000,
        data: { anything: ["goes"] },
        targetType: "sponsorship",
      },
    ])) as [string, string];
    const page = await list(admin, { actorId: actor.id });
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(legacy)).toMatchObject({
      action: "legacy",
      actor: { id: actor.id, name: "Data Actor" },
      createdAt: 50_000,
      data: { legacy: { a: 1 } },
      targetId: "g-1",
      targetType: "gesture",
    });
    expect(byId.get(unknown)?.data).toEqual({ anything: ["goes"] });
  });

  it("keeps the entries of a deleted actor, with a null actor", async () => {
    const admin = await signedUp("admin");
    const actor = await makeUser(testDb(), { name: "Leaving" });
    const target = crypto.randomUUID();
    const seeded = await seed([
      { actorId: actor.id, createdAt: 70_000, targetId: target },
      { actorId: actor.id, createdAt: 71_000, targetId: target },
    ]);
    await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(actor.id).run();

    const page = await list(admin, { targetId: target, targetType: "gesture" });
    expect(ids(page.items).sort()).toEqual([...seeded].sort());
    expect(page.items.every((item) => item.actor === null)).toBe(true);
    const stored = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_log WHERE target_id = ? AND actor_id IS NULL"
    )
      .bind(target)
      .first<{ n: number }>();
    expect(stored?.n).toBe(2);
  });

  it("answers VALIDATION for a cursor it did not issue, and caps the limit", async () => {
    const admin = await signedUp("admin");
    await expect(list(admin, { cursor: "garbage" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      list(admin, { cursor: encodeCursor(["x", 1]) })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(list(admin, { limit: 101 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(list(admin, { from: 2, to: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("seeks an index for each filter", async () => {
    const db = testDb();
    const plan = async (filters: Parameters<typeof auditEntriesQuery>[1]) => {
      const { params, sql } = auditEntriesQuery(db, filters, null, 51).toSQL();
      const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...params)
        .all<{ detail: string }>();
      return results.map((row) => row.detail).join("\n");
    };
    expect(await plan({})).toContain("audit_log_created_at_idx");
    expect(await plan({ action: "legacy" })).toContain(
      "audit_log_action_created_idx"
    );
    expect(await plan({ targetId: "g", targetType: "gesture" })).toContain(
      "audit_log_target_idx"
    );
    expect(await plan({ actorId: "a" })).toContain("audit_log_actor_id_idx");
  });
});

describe("admin.audit.actors", () => {
  it("lists each account with entries once, by name", async () => {
    const admin = await signedUp("admin");
    const zed = await makeUser(testDb(), { name: "Zed Actor" });
    const amy = await makeUser(testDb(), { name: "Amy Actor" });
    await seed([
      { actorId: zed.id, createdAt: 80_000 },
      { actorId: zed.id, createdAt: 81_000 },
      { actorId: amy.id, createdAt: 82_000 },
      { actorId: null, createdAt: 83_000 },
    ]);
    const actors = await callAs<{ id: string; name: string }[]>(
      admin,
      "audit.actors"
    );
    const mine = actors.filter((actor) => [zed.id, amy.id].includes(actor.id));
    expect(mine).toEqual([
      { id: amy.id, name: "Amy Actor" },
      { id: zed.id, name: "Zed Actor" },
    ]);
    expect(actors.some((actor) => actor.id === null)).toBe(false);
  });
});
