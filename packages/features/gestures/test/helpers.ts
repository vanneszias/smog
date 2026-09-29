import { env } from "cloudflare:workers";
import {
  type Category,
  type Gesture,
  gestureCategory,
  gestureKeyword,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
} from "@smog/db";
import type { Db } from "@smog/db/client";
import { makeCategory, makeGesture } from "@smog/db/testing";
import { newId, slugify } from "@smog/utils";
import { bumpCatalogVersion, reindexGesture } from "../src/server";

export async function addCategory(
  db: Db,
  name: string,
  options: { published?: boolean; sortOrder?: number } = {}
): Promise<Category> {
  return await makeCategory(db, {
    name,
    publishedAt: options.published === false ? null : new Date(),
    slug: slugify(name),
    sortOrder: options.sortOrder ?? 0,
  });
}

interface GestureFixture {
  categories?: Category[];
  description?: string;
  keywords?: string[];
  legacyId?: string;
  name: string;
  published?: boolean;
  slug?: string;
}

/** A gesture with categories and keywords, indexed like the services do. */
export async function addGesture(
  db: Db,
  fixture: GestureFixture
): Promise<Gesture> {
  const row = await makeGesture(db, {
    description: fixture.description ?? "",
    legacyId: fixture.legacyId ?? null,
    name: fixture.name,
    publishedAt: fixture.published === false ? null : new Date(),
    slug: fixture.slug ?? slugify(fixture.name),
  });
  const categories = fixture.categories ?? [];
  if (categories.length > 0) {
    await db
      .insert(gestureCategory)
      .values(categories.map((c) => ({ categoryId: c.id, gestureId: row.id })));
  }
  const keywords = fixture.keywords ?? [];
  if (keywords.length > 0) {
    await db.insert(gestureKeyword).values(
      keywords.map((keyword, position) => ({
        gestureId: row.id,
        keyword,
        position,
      }))
    );
  }
  await reindexGesture(db, row.id);
  return row;
}

/** A sponsorship in `status` for the gesture (sponsor row included). */
export async function addSponsorship(
  db: Db,
  gestureId: string,
  status: SponsorshipStatus,
  values: { displayName?: string; endsAt?: Date; videoPlaybackId?: string }
): Promise<void> {
  const sponsorId = newId();
  await db.insert(sponsor).values({
    email: "sponsor@smog.test",
    id: sponsorId,
    locale: "nl",
    name: "Sponsor",
  });
  await db.insert(sponsorship).values({
    displayName: values.displayName ?? "Bakkerij Jan",
    endsAt: values.endsAt ?? null,
    gestureId,
    id: newId(),
    sponsorId,
    status,
    videoPlaybackId: values.videoPlaybackId ?? null,
  });
}

/**
 * Empties the catalogue tables (storage is shared by the tests of a file)
 * and starts a new catalog version.
 */
export async function resetCatalog(): Promise<void> {
  await env.DB.batch(
    [
      "DELETE FROM sponsorship",
      "DELETE FROM sponsor",
      "DELETE FROM gesture",
      "DELETE FROM category",
      "DELETE FROM gesture_fts",
    ].map((statement) => env.DB.prepare(statement))
  );
  // A new version: the isolate's cached projection belongs to the old rows.
  await bumpCatalogVersion(env.KV);
}

/** Applies `packages/db/seed/dev.sql` (one statement per line). */
export async function applyDevSeed(): Promise<void> {
  const statements = env.SEED_SQL.split("\n").filter(
    (line) => line.trim() !== "" && !line.startsWith("--")
  );
  await env.DB.batch(statements.map((line) => env.DB.prepare(line)));
}

const EXECUTE = new Set<PropertyKey>(["all", "first", "raw", "run"]);

/**
 * Wraps a D1 binding and counts its round trips: each statement executed
 * on its own, and each batch once.
 */
export function countingD1(d1: D1Database): {
  count: () => number;
  d1: D1Database;
} {
  let trips = 0;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = new Proxy(statement, {
      get(target, key) {
        const value: unknown = Reflect.get(target, key);
        if (typeof value !== "function") {
          return value;
        }
        if (key === "bind") {
          return (...args: unknown[]) =>
            wrap(value.apply(target, args) as D1PreparedStatement);
        }
        if (EXECUTE.has(key)) {
          return (...args: unknown[]) => {
            trips += 1;
            return value.apply(target, args);
          };
        }
        return value.bind(target);
      },
    });
    originals.set(proxy, statement);
    return proxy;
  };
  const proxy = new Proxy(d1, {
    get(target, key) {
      if (key === "prepare") {
        return (query: string) => wrap(target.prepare(query));
      }
      if (key === "batch") {
        return (statements: D1PreparedStatement[]) => {
          trips += 1;
          return target.batch(statements.map((s) => originals.get(s) ?? s));
        };
      }
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { count: () => trips, d1: proxy };
}

/** Wraps a KV binding and counts its writes (`put`, `delete`). */
export function spyKv(kv: KVNamespace): {
  binding: KVNamespace;
  readonly writes: number;
} {
  let writes = 0;
  const binding = new Proxy(kv, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      if (key === "put" || key === "delete") {
        return (...args: unknown[]) => {
          writes += 1;
          return value.apply(target, args);
        };
      }
      return value.bind(target);
    },
  });
  return {
    binding,
    get writes() {
      return writes;
    },
  };
}
