import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIT_RETENTION_MS,
  auditLog,
  RETENTION_CHUNK_SIZE,
  RETENTION_MAX_CHUNKS,
  RETENTION_PURGES,
  RetentionPurgeError,
  runRetentionPurges,
  SPONSORSHIP_TOKEN_GRACE_MS,
  session,
  sponsor,
  sponsorship,
  sponsorshipToken,
  verification,
} from "../src";
import { createDb, type Db } from "../src/client";
import { makeGesture, makeUser } from "../src/testing";

const db: Db = createDb(env.DB);
const NOW = new Date("2026-10-02T03:15:00Z");
const DAY = 86_400_000;
/** A plan line that reads a whole table. */
const FULL_SCAN = /^SCAN \S+$/m;

async function clear(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM audit_log"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare("DELETE FROM sponsorship_token"),
  ]);
}

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{
    n: number;
  }>();
  return row?.n ?? -1;
}

async function addAudit(createdAt: Date, n = 1): Promise<void> {
  const rows = Array.from({ length: n }, () => ({
    action: "gesture.update" as const,
    createdAt,
    data: {},
    id: newId(),
    targetId: "g",
    targetType: "gesture" as const,
  }));
  // 7 bound values per row: 14 rows per insert stays under D1's 100.
  for (let at = 0; at < rows.length; at += 14) {
    // biome-ignore lint/performance/noAwaitInLoops: D1's parameter limit forces small inserts; order does not matter but they are few.
    await db.insert(auditLog).values(rows.slice(at, at + 14));
  }
}

async function addToken(fields: {
  expiresAt: Date;
  usedAt?: Date;
}): Promise<string> {
  const gesture = await makeGesture(db);
  const sponsorId = newId();
  const sponsorshipId = newId();
  await db.insert(sponsor).values({
    email: "sponsor@smog.example",
    id: sponsorId,
    locale: "nl",
    name: "Acme",
  });
  await db.insert(sponsorship).values({
    displayName: "Acme",
    gestureId: gesture.id,
    id: sponsorshipId,
    sponsorId,
    status: "expired",
  });
  const id = newId();
  await db.insert(sponsorshipToken).values({
    expiresAt: fields.expiresAt,
    id,
    purpose: "renewal",
    sponsorshipId,
    tokenHash: newId(),
    usedAt: fields.usedAt ?? null,
  });
  return id;
}

beforeEach(clear);

describe("the retention purges (ruling 9)", () => {
  it("deletes audit entries older than 3 × 365 days, at the boundary to the millisecond", async () => {
    const edge = NOW.getTime() - AUDIT_RETENTION_MS;
    expect(AUDIT_RETENTION_MS).toBe(3 * 365 * DAY);
    await addAudit(new Date(edge + 1));
    await addAudit(new Date(edge));
    await addAudit(new Date(edge - 1));

    const counts = await runRetentionPurges(db, NOW);

    expect(counts.audit_log).toBe(1);
    const left = await db
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .orderBy(auditLog.createdAt);
    expect(left.map((row) => row.createdAt.getTime())).toEqual([
      edge,
      edge + 1,
    ]);
  });

  it("deletes expired sessions and verifications and keeps live ones", async () => {
    const user = await makeUser(db);
    await db.insert(session).values([
      {
        expiresAt: new Date(NOW.getTime() - 1),
        id: "s-gone",
        token: newId(),
        userId: user.id,
      },
      {
        // Expiring exactly now: not expired yet (the comparison is strict).
        expiresAt: NOW,
        id: "s-edge",
        token: newId(),
        userId: user.id,
      },
      {
        expiresAt: new Date(NOW.getTime() + DAY),
        id: "s-live",
        token: newId(),
        userId: user.id,
      },
    ]);
    await db.insert(verification).values([
      {
        expiresAt: new Date(NOW.getTime() - 1),
        id: "v-gone",
        identifier: "a",
        value: "b",
      },
      {
        expiresAt: new Date(NOW.getTime() + 1),
        id: "v-live",
        identifier: "a",
        value: "b",
      },
    ]);

    const counts = await runRetentionPurges(db, NOW);

    expect(counts.session).toBe(1);
    expect(counts.verification).toBe(1);
    const sessions = await db.select({ id: session.id }).from(session);
    expect(sessions.map((row) => row.id).sort()).toEqual(["s-edge", "s-live"]);
    const verifications = await db
      .select({ id: verification.id })
      .from(verification);
    expect(verifications.map((row) => row.id)).toEqual(["v-live"]);
  });

  it("deletes tokens used or expired more than 29 days ago (gone within 30), and keeps the rest", async () => {
    expect(SPONSORSHIP_TOKEN_GRACE_MS).toBe(29 * DAY);
    const old = new Date(NOW.getTime() - SPONSORSHIP_TOKEN_GRACE_MS - 1);
    const recent = new Date(NOW.getTime() - SPONSORSHIP_TOKEN_GRACE_MS + 1);
    const future = new Date(NOW.getTime() + DAY);
    await addToken({ expiresAt: future, usedAt: old });
    await addToken({ expiresAt: old });
    const usedRecently = await addToken({ expiresAt: future, usedAt: recent });
    const expiredRecently = await addToken({ expiresAt: recent });
    const open = await addToken({ expiresAt: future });

    const counts = await runRetentionPurges(db, NOW);

    expect(counts.sponsorship_token).toBe(2);
    const left = await db
      .select({ id: sponsorshipToken.id })
      .from(sponsorshipToken);
    expect(left.map((row) => row.id).sort()).toEqual(
      [usedRecently, expiredRecently, open].sort()
    );
  });

  it("deletes in chunks of 500, at most 20 per table per run, and the next run continues", async () => {
    expect(RETENTION_CHUNK_SIZE).toBe(500);
    expect(RETENTION_MAX_CHUNKS).toBe(20);
    const old = new Date(NOW.getTime() - AUDIT_RETENTION_MS - DAY);
    await addAudit(old, 1200);

    const first = await runRetentionPurges(db, NOW, { maxChunks: 2 });
    expect(first.audit_log).toBe(1000);
    expect(await count("audit_log")).toBe(200);

    const second = await runRetentionPurges(db, NOW, { maxChunks: 2 });
    expect(second.audit_log).toBe(200);
    expect(await count("audit_log")).toBe(0);
  });

  it("builds each chunk as a rowid IN (… LIMIT 500) delete with at most two bound values", () => {
    for (const purge of RETENTION_PURGES) {
      const query = purge.statement(db, NOW).toSQL();
      expect(query.sql, purge.table).toContain(
        `rowid IN (SELECT rowid FROM "${purge.table}"`
      );
      expect(query.sql, purge.table).toContain(`LIMIT ${RETENTION_CHUNK_SIZE}`);
      expect(query.params.length, purge.table).toBeLessThanOrEqual(2);
    }
  });

  it("seeks an index for every chunk read but the used-token one", async () => {
    expect(
      RETENTION_PURGES.filter((purge) => !purge.indexed).map((p) => p.what)
    ).toEqual(["sponsorship tokens used more than 29 days ago"]);
    for (const purge of RETENTION_PURGES.filter((p) => p.indexed)) {
      const query = purge.statement(db, NOW).toSQL();
      const inner = query.sql.slice(
        query.sql.indexOf("(SELECT") + 1,
        query.sql.lastIndexOf(")")
      );
      // biome-ignore lint/performance/noAwaitInLoops: a few plan reads, in order for a readable failure.
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${inner}`)
        .bind(...query.params)
        .all<{ detail: string }>();
      const detail = plan.results.map((row) => row.detail).join("\n");
      expect(detail, purge.table).toContain("USING");
      expect(detail, purge.table).not.toMatch(FULL_SCAN);
    }
  });

  it("counts without deleting in a dry run, each row once", async () => {
    const old = new Date(NOW.getTime() - AUDIT_RETENTION_MS - 1);
    await addAudit(old, 3);
    await addAudit(new Date(NOW.getTime() - AUDIT_RETENTION_MS + 1));
    const gone = new Date(NOW.getTime() - SPONSORSHIP_TOKEN_GRACE_MS - 1);
    // Used and expired more than 29 days ago: two purges match, one row.
    await addToken({ expiresAt: gone, usedAt: gone });
    await addToken({ expiresAt: new Date(NOW.getTime() + DAY) });
    const user = await makeUser(db);
    await db.insert(session).values({
      expiresAt: new Date(NOW.getTime() - 1),
      id: "s-gone",
      token: newId(),
      userId: user.id,
    });

    const dry = await runRetentionPurges(db, NOW, { dryRun: true });

    expect(dry).toEqual({
      audit_log: 3,
      session: 1,
      sponsorship_token: 1,
      verification: 0,
    });
    expect(await count("audit_log")).toBe(4);
    expect(await count("session")).toBe(1);
    expect(await count("sponsorship_token")).toBe(2);

    // The real run deletes exactly what the dry run counted.
    expect(await runRetentionPurges(db, NOW)).toEqual(dry);
    expect(await count("audit_log")).toBe(1);
  });

  it("logs what it deleted before it rethrows a partial failure (fix wave, jobs M-6)", async () => {
    await addAudit(new Date(NOW.getTime() - AUDIT_RETENTION_MS - 1), 2);
    const broken = new Proxy(env.DB, {
      get(target, key, receiver) {
        if (key === "prepare") {
          return (query: string) => {
            if (query.startsWith("delete from \"verification\"")) {
              throw new Error("verification is locked");
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const failure = await runRetentionPurges(createDb(broken), NOW).catch(
      (e: unknown) => e
    );

    expect(failure).toBeInstanceOf(RetentionPurgeError);
    expect((failure as RetentionPurgeError).counts).toMatchObject({
      audit_log: 2,
      verification: 0,
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[db] The retention purge failed part way; deleted: {"audit_log":2')
    );
    expect(await count("audit_log")).toBe(0);
    error.mockRestore();
  });

  it("deletes nothing the second time", async () => {
    await addAudit(new Date(NOW.getTime() - AUDIT_RETENTION_MS - 1), 3);
    expect((await runRetentionPurges(db, NOW)).audit_log).toBe(3);
    const again = await runRetentionPurges(db, NOW);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
  });
});
