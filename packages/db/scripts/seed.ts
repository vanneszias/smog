/**
 * Writes `seed/dev.sql`: 5 categories, 20 published gestures (with keywords,
 * category links and `gesture_fts` rows, rebuilt by the statements
 * `reindexGesture` runs: `src/fts.ts`) and the admin user
 * `admin@smog.test`. Ids and timestamps are fixed and every statement is an
 * upsert, so the file is deterministic and safe to apply again.
 *
 * `bun -F @smog/db seed:dev` regenerates it and applies it to the local dev
 * D1 (`wrangler d1 execute DB --env dev --local`, from apps/site). Apply the
 * migrations first (`bun -F @smog/db migrate:dev`).
 *
 * One statement per line: wrangler splits the file itself, and the Vitest
 * seed test splits it by line.
 */
import { scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { slugify } from "@smog/utils";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { rebuildGestureFtsSql } from "../src/fts";
import { gestureSortName } from "../src/sort-name";

/** A public sample Mux playback id for every seeded gesture. */
export const SEED_PLAYBACK_ID = "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU";
export const SEED_ADMIN_EMAIL = "admin@smog.test";
/**
 * DEV ONLY: the seeded admin's password (documented in AGENTS.md and
 * apps/site/.dev.vars.example). The seed never runs outside local D1.
 */
export const SEED_ADMIN_PASSWORD = "smog-dev-admin";
/** A fixed salt keeps the seed file deterministic (dev only). */
const SEED_ADMIN_SALT = "5eed5a175eed5a175eed5a175eed5a17";
/** 2026-01-01T00:00:00.000Z */
const SEED_TIME = Date.UTC(2026, 0, 1);

interface SeedGesture {
  description: string;
  keywords: string[];
  name: string;
}

interface SeedCategory {
  gestures: SeedGesture[];
  name: string;
}

const CATEGORIES: SeedCategory[] = [
  {
    gestures: [
      {
        description: "Iemand begroeten.",
        keywords: ["hoi", "dag zeggen"],
        name: "Hallo",
      },
      {
        description: "Afscheid nemen.",
        keywords: ["tot ziens", "daag"],
        name: "Dag",
      },
      {
        description: "Iemand 's ochtends begroeten.",
        keywords: ["ochtend", "morgen"],
        name: "Goedemorgen",
      },
      {
        description: "Iemand bedanken.",
        keywords: ["bedankt", "merci"],
        name: "Dankjewel",
      },
    ],
    name: "Begroeten",
  },
  {
    gestures: [
      { description: "De moeder.", keywords: ["moeder", "mams"], name: "Mama" },
      { description: "De vader.", keywords: ["vader", "paps"], name: "Papa" },
      { description: "Een broer.", keywords: ["broertje"], name: "Broer" },
      { description: "Een zus.", keywords: ["zusje"], name: "Zus" },
    ],
    name: "Familie",
  },
  {
    gestures: [
      {
        description: "Een hond.",
        keywords: ["hondje", "huisdier"],
        name: "Hond",
      },
      { description: "Een kat.", keywords: ["poes", "huisdier"], name: "Kat" },
      { description: "Een vogel.", keywords: ["vogeltje"], name: "Vogel" },
      { description: "Een paard.", keywords: ["pony"], name: "Paard" },
    ],
    name: "Dieren",
  },
  {
    gestures: [
      {
        description: "Iets eten.",
        keywords: ["honger", "maaltijd"],
        name: "Eten",
      },
      { description: "Iets drinken.", keywords: ["dorst"], name: "Drinken" },
      { description: "Een appel.", keywords: ["fruit"], name: "Appel" },
      {
        description: "Een kop koffie.",
        keywords: ["café", "espresso"],
        name: "Koffie",
      },
    ],
    name: "Eten en drinken",
  },
  {
    gestures: [
      {
        description: "Blij zijn.",
        keywords: ["vrolijk", "gelukkig"],
        name: "Blij",
      },
      {
        description: "Verdrietig zijn.",
        keywords: ["huilen"],
        name: "Verdrietig",
      },
      { description: "Boos zijn.", keywords: ["kwaad"], name: "Boos" },
      { description: "Bang zijn.", keywords: ["schrik"], name: "Bang" },
    ],
    name: "Gevoelens",
  },
];

/** A fixed UUID-shaped id: `5eed000<kind>-0000-4000-8000-<n>`. */
function seedId(kind: number, n: number): string {
  return `5eed000${kind}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * Better Auth's password hash format (`@better-auth/utils/password`):
 * `<salt>:<key>` in hex, scrypt N=16384 r=16 p=1, 64-byte key, NFKC input,
 * with the hex salt string itself as the salt.
 */
function hashPassword(password: string, salt: string): string {
  const N = 16_384;
  const r = 16;
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    maxmem: 128 * N * r * 2,
    N,
    p: 1,
    r,
  });
  return `${salt}:${key.toString("hex")}`;
}

function literal(value: string | number | null): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function upsert(
  table: string,
  row: Record<string, string | number | null>,
  conflict: string[],
  keep: string[] = []
): string {
  const columns = Object.keys(row);
  const updates = columns.filter(
    (column) => !(conflict.includes(column) || keep.includes(column))
  );
  const values = columns.map((column) => literal(row[column] ?? null));
  const action =
    updates.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(", ")}`;
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT (${conflict.join(", ")}) ${action};`;
}

const dialect = new SQLiteSyncDialect();

/**
 * The gesture's `gesture_fts` rebuild (the statements `reindexGesture` runs),
 * rendered with the id inlined. It reads the rows written above it.
 */
function ftsStatements(gestureId: string): string[] {
  return rebuildGestureFtsSql(gestureId).map((statement) => {
    const query = dialect.sqlToQuery(statement);
    if (query.params.length > 0) {
      throw new Error("[seed] Failed to inline the gesture_fts statement");
    }
    return `${query.sql};`;
  });
}

export function buildSeedSql(): string {
  const lines = [
    "-- Generated by packages/db/scripts/seed.ts. Do not edit; run `bun -F @smog/db seed:build`.",
  ];
  let gestureNumber = 0;
  CATEGORIES.forEach((group, categoryIndex) => {
    const categoryId = seedId(1, categoryIndex + 1);
    lines.push(
      upsert(
        "category",
        {
          created_at: SEED_TIME,
          id: categoryId,
          name: group.name,
          published_at: SEED_TIME,
          slug: slugify(group.name),
          sort_order: categoryIndex,
          updated_at: SEED_TIME,
        },
        ["id"]
      )
    );
    for (const item of group.gestures) {
      gestureNumber += 1;
      const gestureId = seedId(2, gestureNumber);
      lines.push(
        upsert(
          "gesture",
          {
            created_at: SEED_TIME,
            description: item.description,
            id: gestureId,
            name: item.name,
            playback_id: SEED_PLAYBACK_ID,
            published_at: SEED_TIME,
            slug: slugify(item.name),
            sort_name: gestureSortName(item.name),
            updated_at: SEED_TIME,
          },
          ["id"]
        ),
        upsert(
          "gesture_category",
          { category_id: categoryId, gesture_id: gestureId },
          ["gesture_id", "category_id"]
        ),
        ...item.keywords.map((keyword, position) =>
          upsert(
            "gesture_keyword",
            { gesture_id: gestureId, keyword, position },
            ["gesture_id", "keyword"]
          )
        ),
        ...ftsStatements(gestureId)
      );
    }
  });
  lines.push(
    upsert(
      "user",
      {
        created_at: SEED_TIME,
        email: SEED_ADMIN_EMAIL,
        email_verified: 1,
        id: seedId(3, 1),
        locale: "nl",
        name: "SMOG Admin",
        role: "admin",
        updated_at: SEED_TIME,
      },
      // An account that signed up as admin@smog.test keeps its id and is promoted.
      ["email"],
      ["id", "created_at"]
    )
  );
  // The admin's email + password credential (the user id may be an existing
  // account's, see above). It replaces any other credential of that user.
  const adminId = `(SELECT id FROM user WHERE email = ${literal(SEED_ADMIN_EMAIL)})`;
  const accountId = seedId(4, 1);
  lines.push(
    `DELETE FROM account WHERE provider_id = 'credential' AND user_id = ${adminId} AND id <> ${literal(accountId)};`,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) SELECT ${literal(accountId)}, id, 'credential', id, ${literal(hashPassword(SEED_ADMIN_PASSWORD, SEED_ADMIN_SALT))}, ${SEED_TIME}, ${SEED_TIME} FROM user WHERE email = ${literal(SEED_ADMIN_EMAIL)} ON CONFLICT (id) DO UPDATE SET account_id = excluded.account_id, user_id = excluded.user_id, password = excluded.password, updated_at = excluded.updated_at;`
  );
  return `${lines.join("\n")}\n`;
}

export const SEED_FILE = new URL("../seed/dev.sql", import.meta.url);

if (import.meta.main) {
  try {
    writeFileSync(SEED_FILE, buildSeedSql());
    console.log(`[seed] Wrote ${SEED_FILE.pathname}`);
  } catch (error) {
    console.error("[seed] Failed to write the seed:", error);
    throw error;
  }
}
