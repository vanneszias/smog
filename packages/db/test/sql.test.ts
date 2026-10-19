import { env } from "cloudflare:workers";
import { newId } from "@smog/utils";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  category,
  failWhen,
  GuardFailedError,
  inList,
  jsonList,
  toGuardFailure,
} from "../src";
import { createDb, type Db } from "../src/client";
import { makeCategory } from "../src/testing";

/*
 * The D1-safe list idiom (phase 5 fix wave M6): any number of values is
 * one bound parameter, so lists past D1's 100-parameter limit still work.
 */

const db: Db = createDb(env.DB);

describe("jsonList", () => {
  it("is one JSON array parameter", () => {
    expect(jsonList(["a", "b'c", 3])).toBe('["a","b\'c",3]');
    expect(jsonList([])).toBe("[]");
  });
});

describe("inList", () => {
  it("matches exactly the listed values, past 100 of them", async () => {
    const made = await Promise.all(
      Array.from({ length: 3 }, () => makeCategory(db))
    );
    const wanted = [
      ...Array.from({ length: 150 }, () => newId()),
      made[0]?.id,
      made[2]?.id,
    ].filter((id): id is string => id !== undefined);
    const rows = await db
      .select({ id: category.id })
      .from(category)
      .where(inList(category.id, wanted));
    expect(rows.map((row) => row.id).sort()).toEqual(
      [made[0]?.id, made[2]?.id].sort()
    );
  });

  it("matches nothing for an empty list", async () => {
    await makeCategory(db);
    const rows = await db
      .select({ id: category.id })
      .from(category)
      .where(inList(category.id, []));
    expect(rows).toEqual([]);
  });

  it("binds the list as one parameter", () => {
    const query = db
      .select({ id: category.id })
      .from(category)
      .where(inList(category.id, ["a", "b", "c"]))
      .toSQL();
    expect(query.params).toEqual(['["a","b","c"]']);
    expect(query.sql).toContain("IN (SELECT value FROM json_each(?))");
  });

  it("takes any SQL expression on the left", () => {
    const query = db
      .select({ id: category.id })
      .from(category)
      .where(inList(sql`lower(${category.slug})`, ["x"]))
      .toSQL();
    expect(query.params).toEqual(['["x"]']);
  });
});

/*
 * The in-batch guard (moved from `@smog/admin` in phase 6): a guard that
 * fires rolls the whole batch back and names itself.
 */
describe("failWhen", () => {
  it("rolls back the statements before it and is named by toGuardFailure", async () => {
    const made = await makeCategory(db);
    let caught: unknown;
    try {
      await db.batch([
        db
          .update(category)
          .set({ name: "Half geschreven" })
          .where(sql`${category.id} = ${made.id}`),
        failWhen(db, "stale", sql`1 = 1`),
      ]);
    } catch (error) {
      caught = error;
    }
    const failure = toGuardFailure(caught);
    expect(failure).toBeInstanceOf(GuardFailedError);
    expect(failure?.guard).toBe("stale");
    expect(failure?.cause).toBe(caught);
    const [row] = await db
      .select({ name: category.name })
      .from(category)
      .where(sql`${category.id} = ${made.id}`);
    expect(row?.name).toBe(made.name);
  });

  it("lets the batch through when the condition does not hold", async () => {
    const made = await makeCategory(db);
    await db.batch([
      failWhen(db, "stale", sql`1 = 0`),
      db
        .update(category)
        .set({ name: "Doorgelaten" })
        .where(sql`${category.id} = ${made.id}`),
    ]);
    const [row] = await db
      .select({ name: category.name })
      .from(category)
      .where(sql`${category.id} = ${made.id}`);
    expect(row?.name).toBe("Doorgelaten");
  });

  it("toGuardFailure is null for any other error", () => {
    expect(toGuardFailure(new Error("UNIQUE constraint failed"))).toBeNull();
    expect(toGuardFailure("smog-guard:x")).toBeNull();
  });
});
