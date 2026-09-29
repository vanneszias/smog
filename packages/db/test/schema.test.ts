import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  consentEvent,
  favorite,
  gesture,
  list,
  listItem,
  listShare,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  user,
} from "../src";
import type { Db } from "../src/client";
import {
  createTestDb,
  makeCategory,
  makeGesture,
  makeUser,
} from "../src/testing";

const TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "passkey",
  "category",
  "gesture",
  "gesture_category",
  "gesture_keyword",
  "gesture_fts",
  "favorite",
  "list",
  "list_item",
  "list_share",
  "consent_event",
  "audit_log",
  "sponsor",
  "invoice_request",
  "sponsorship",
  "payment",
  "payment_item",
  "render_job",
  "sponsorship_event",
  "sponsorship_token",
];

const DUPLICATE_FAVORITE =
  /UNIQUE constraint failed: favorite\.user_id, favorite\.gesture_id/;
const DUPLICATE_BLOCKING_SPONSORSHIP =
  /UNIQUE constraint failed: sponsorship\.gesture_id/;
const DUPLICATE_ACTIVE_SHARE =
  /UNIQUE constraint failed: list_share\.list_id, list_share\.role/;
const CHECK_FAILED = /CHECK constraint failed/;
const FOREIGN_KEY_FAILED = /FOREIGN KEY constraint failed/;

const NOW = new Date("2026-09-29T12:00:00.000Z");

/** The messages of an error and its causes (drizzle wraps the D1 error). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    return messages.join("\n");
  }
  throw new Error("expected the query to fail");
}

let db: Db;

beforeEach(() => {
  db = createTestDb(env);
});

async function makeSponsorship(
  gestureId: string,
  status: SponsorshipStatus
): Promise<string> {
  const sponsorId = newId();
  await db.insert(sponsor).values({
    createdAt: NOW,
    email: "sponsor@example.com",
    id: sponsorId,
    locale: "nl",
    name: "Sponsor",
  });
  const id = newId();
  await db.insert(sponsorship).values({
    createdAt: NOW,
    displayName: "Bakkerij Jansens",
    gestureId,
    id,
    sponsorId,
    status,
    updatedAt: NOW,
  });
  return id;
}

describe("schema", () => {
  it("(a) creates every table of spec §5", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all<{ name: string }>();
    const names = results.map((row) => row.name);
    for (const table of TABLES) {
      expect(names).toContain(table);
    }
  });

  it("(b) rejects a duplicate favorite", async () => {
    const owner = await makeUser(db);
    const item = await makeGesture(db);
    const row = { createdAt: NOW, gestureId: item.id, userId: owner.id };
    await db.insert(favorite).values(row);

    expect(await failure(db.insert(favorite).values(row))).toMatch(
      DUPLICATE_FAVORITE
    );
  });

  it("(c) deleting a user cascades to their data and keeps the audit log", async () => {
    const owner = await makeUser(db);
    const item = await makeGesture(db);
    const listId = newId();
    const auditId = newId();
    await db.batch([
      db
        .insert(favorite)
        .values({ createdAt: NOW, gestureId: item.id, userId: owner.id }),
      db.insert(list).values({
        createdAt: NOW,
        id: listId,
        name: "Thuis",
        ownerId: owner.id,
        updatedAt: NOW,
      }),
      db.insert(listItem).values({
        addedBy: owner.id,
        createdAt: NOW,
        gestureId: item.id,
        listId,
        position: 0,
      }),
      db.insert(consentEvent).values({
        createdAt: NOW,
        granted: true,
        id: newId(),
        policyVersion: "2026-09-29",
        purpose: "analytics",
        source: "web",
        userId: owner.id,
      }),
      db.insert(auditLog).values({
        action: "gesture.update",
        actorId: owner.id,
        createdAt: NOW,
        data: { changes: ["name"] },
        id: auditId,
        targetId: item.id,
        targetType: "gesture",
      }),
    ]);

    await db.delete(user).where(eq(user.id, owner.id));

    const count = async (table: string, column: string): Promise<number> => {
      const row = await env.DB.prepare(
        `SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`
      )
        .bind(column === "list_id" ? listId : owner.id)
        .first<{ n: number }>();
      return row?.n ?? -1;
    };
    expect(await count("favorite", "user_id")).toBe(0);
    expect(await count("list", "owner_id")).toBe(0);
    expect(await count("list_item", "list_id")).toBe(0);
    expect(await count("consent_event", "user_id")).toBe(0);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, auditId));
    expect(audit?.actorId).toBeNull();
    expect(audit?.data).toEqual({ changes: ["name"] });
  });

  it("(d) allows one blocking sponsorship per gesture", async () => {
    const free = await makeGesture(db);
    await makeSponsorship(free.id, "expired");
    await expect(makeSponsorship(free.id, "awaiting_payment")).resolves.toEqual(
      expect.any(String)
    );

    const taken = await makeGesture(db);
    await makeSponsorship(taken.id, "live");
    expect(await failure(makeSponsorship(taken.id, "in_review"))).toMatch(
      DUPLICATE_BLOCKING_SPONSORSHIP
    );
  });

  it("(e) allows one active share link per list and role", async () => {
    const owner = await makeUser(db);
    const listId = newId();
    await db.insert(list).values({
      createdAt: NOW,
      id: listId,
      name: "School",
      ownerId: owner.id,
      updatedAt: NOW,
    });
    const share = (id: string) =>
      db.insert(listShare).values({
        createdAt: NOW,
        createdBy: owner.id,
        id,
        listId,
        role: "view",
        token: newId(),
      });
    const first = newId();
    await share(first);
    await db.insert(listShare).values({
      createdAt: NOW,
      id: newId(),
      listId,
      role: "edit",
      token: newId(),
    });

    expect(await failure(share(newId()))).toMatch(DUPLICATE_ACTIVE_SHARE);

    await db
      .update(listShare)
      .set({ revokedAt: NOW })
      .where(eq(listShare.id, first));
    await expect(share(newId())).resolves.toBeDefined();
  });

  it("(f) rejects an unknown sponsorship status", async () => {
    const item = await makeGesture(db);
    const id = await makeSponsorship(item.id, "cancelled");

    expect(
      await failure(
        env.DB.prepare("UPDATE sponsorship SET status = 'bogus' WHERE id = ?")
          .bind(id)
          .run()
      )
    ).toMatch(CHECK_FAILED);
  });

  it("(g) searches gesture_fts by prefix and without accents", async () => {
    const dog = await makeGesture(db, { name: "Hond" });
    const coffee = await makeGesture(db, { name: "Café" });
    const insert = env.DB.prepare(
      "INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) VALUES (?, ?, ?, ?, ?)"
    );
    await env.DB.batch([
      insert.bind(dog.id, "Hond", "huisdier hondje", "Dieren", "Een hond."),
      insert.bind(coffee.id, "Café", "koffie", "Eten en drinken", "Een café."),
    ]);

    const search = async (query: string): Promise<string[]> => {
      const { results } = await env.DB.prepare(
        "SELECT gesture_id FROM gesture_fts WHERE gesture_fts MATCH ? ORDER BY rank"
      )
        .bind(query)
        .all<{ gesture_id: string }>();
      return results.map((row) => row.gesture_id);
    };

    expect(await search("hond*")).toContain(dog.id);
    expect(await search("cafe")).toContain(coffee.id);
    expect(await search("CAFÉ")).toContain(coffee.id);
    expect(await search("cafe")).not.toContain(dog.id);
  });

  it("(h) refuses to delete a gesture that has a sponsorship", async () => {
    const item = await makeGesture(db);
    await makeSponsorship(item.id, "expired");

    expect(
      await failure(db.delete(gesture).where(eq(gesture.id, item.id)))
    ).toMatch(FOREIGN_KEY_FAILED);
  });

  it("links gestures to categories and cascades their join rows", async () => {
    const item = await makeGesture(db);
    const group = await makeCategory(db);
    await env.DB.prepare(
      "INSERT INTO gesture_category (gesture_id, category_id) VALUES (?, ?)"
    )
      .bind(item.id, group.id)
      .run();

    await db.delete(gesture).where(eq(gesture.id, item.id));

    const row = await db.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM gesture_category WHERE category_id = ${group.id}`
    );
    expect(row.n).toBe(0);
  });
});
