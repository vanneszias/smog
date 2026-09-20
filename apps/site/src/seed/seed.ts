import type { Payload } from "payload";
import {
  type CategoryFixture,
  categoryFixtures,
  type GestureFixture,
  gestureFixtures,
  type TranslatedLocale,
} from "./fixtures";

/**
 * Fills a local development database with the fixtures.
 *
 * **Idempotent, deliberately.** Every document is looked up by its natural key
 * — the Dutch `name` for a category or gesture, the email for a user — and
 * updated when it is already there. The alternative, refusing to run against a
 * non-empty database, would mean wiping by hand every time a fixture changes,
 * and a wipe is precisely the operation this script must never learn to
 * perform: deleting a gesture is blocked by `blockDeleteWhenSponsored` once a
 * sponsorship points at it, so a "clean first" seed would fail halfway and
 * leave the database in a worse state than it found it. Re-running instead
 * re-applies the fixtures in place: new fixtures appear, edited ones are
 * corrected, and nothing is duplicated or destroyed.
 *
 * Content created by hand in the admin panel is left alone — the seed only
 * touches names it owns.
 *
 * **Everything here runs through the local API with `overrideAccess: true`.**
 * That is the privileged path, spelled out at every call site rather than
 * relied on as a default: seeding legitimately writes admin-only collections
 * (`gestures`, `categories`) and sets `users.role`, which `isAdminField`
 * blocks over HTTP. The guard in `./guard` is what keeps that privilege
 * pointed at a local emulated database.
 */

/** Dutch is the source of truth; see the spec's Localization section. */
const DEFAULT_LOCALE = "nl";

export interface SeedCounts {
  created: number;
  updated: number;
}

export interface SeedSummary {
  categories: SeedCounts;
  gestures: SeedCounts;
  users: SeedCounts;
  /** Dutch category name to document id, for callers that need to link to one. */
  categoryIds: Record<string, number>;
  /** Dutch gesture name to document id. */
  gestureIds: Record<string, number>;
}

interface SeedUser {
  email: string;
  password: string;
  role: "admin" | "user";
}

interface SeedOptions {
  payload: Payload;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
}

/**
 * Local defaults. Safe to commit precisely because `assertSeedTargetIsLocal`
 * refuses to let the seed reach a deployed database: these credentials can
 * only ever exist in a `.wrangler/state` SQLite file on a developer's machine.
 */
const DEFAULTS = {
  SEED_ADMIN_EMAIL: "admin@smog.local",
  SEED_ADMIN_PASSWORD: "seed-admin-password",
  SEED_USER_EMAIL: "user@smog.local",
  SEED_USER_PASSWORD: "seed-user-password",
} as const;

const fromEnv = (
  env: Record<string, string | undefined>,
  name: keyof typeof DEFAULTS
): string => {
  const value = env[name];

  return value && value.trim() !== "" ? value : DEFAULTS[name];
};

/** The two accounts the seed creates, resolved from the environment. */
export function seedUsersFromEnv(
  env: Record<string, string | undefined>
): [SeedUser, SeedUser] {
  return [
    {
      email: fromEnv(env, "SEED_ADMIN_EMAIL"),
      password: fromEnv(env, "SEED_ADMIN_PASSWORD"),
      role: "admin",
    },
    {
      email: fromEnv(env, "SEED_USER_EMAIL"),
      password: fromEnv(env, "SEED_USER_PASSWORD"),
      role: "user",
    },
  ];
}

const emptyCounts = (): SeedCounts => ({ created: 0, updated: 0 });

async function findIdByName(
  payload: Payload,
  collection: "categories" | "gestures",
  name: string
): Promise<number | undefined> {
  const { docs } = await payload.find({
    collection,
    locale: DEFAULT_LOCALE,
    where: { name: { equals: name } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return docs[0]?.id;
}

async function writeTranslations(
  payload: Payload,
  collection: "categories" | "gestures",
  id: number,
  translations: Partial<Record<TranslatedLocale, object>> | undefined
): Promise<void> {
  for (const [locale, data] of Object.entries(translations ?? {})) {
    await payload.update({
      collection,
      id,
      locale: locale as TranslatedLocale,
      data,
      overrideAccess: true,
    });
  }
}

async function upsertCategory(
  payload: Payload,
  fixture: CategoryFixture,
  counts: SeedCounts
): Promise<number> {
  const data = { name: fixture.name, isActive: true };
  const existing = await findIdByName(payload, "categories", fixture.name);
  let id: number;

  if (existing === undefined) {
    const created = await payload.create({
      collection: "categories",
      locale: DEFAULT_LOCALE,
      data,
      overrideAccess: true,
    });
    id = created.id;
    counts.created += 1;
  } else {
    await payload.update({
      collection: "categories",
      id: existing,
      locale: DEFAULT_LOCALE,
      data,
      overrideAccess: true,
    });
    id = existing;
    counts.updated += 1;
  }

  await writeTranslations(payload, "categories", id, fixture.translations);

  return id;
}

async function upsertGesture(
  payload: Payload,
  fixture: GestureFixture,
  categoryIds: Record<string, number>,
  counts: SeedCounts
): Promise<number> {
  const categories = fixture.categories.map((name) => {
    const categoryId = categoryIds[name];

    if (categoryId === undefined) {
      throw new Error(
        `Gesture "${fixture.name}" names category "${name}", which is not in categoryFixtures.`
      );
    }

    return categoryId;
  });

  const data = {
    name: fixture.name,
    categories,
    playbackId: fixture.playbackId,
    concepts: fixture.concepts,
    info: fixture.info ?? null,
    isActive: fixture.isActive ?? true,
  };

  const existing = await findIdByName(payload, "gestures", fixture.name);
  let id: number;

  if (existing === undefined) {
    const created = await payload.create({
      collection: "gestures",
      locale: DEFAULT_LOCALE,
      data,
      overrideAccess: true,
    });
    id = created.id;
    counts.created += 1;
  } else {
    await payload.update({
      collection: "gestures",
      id: existing,
      locale: DEFAULT_LOCALE,
      data,
      overrideAccess: true,
    });
    id = existing;
    counts.updated += 1;
  }

  await writeTranslations(payload, "gestures", id, fixture.translations);

  return id;
}

async function upsertUser(
  payload: Payload,
  user: SeedUser,
  counts: SeedCounts
): Promise<void> {
  const { docs } = await payload.find({
    collection: "users",
    where: { email: { equals: user.email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const existing = docs[0];

  if (existing === undefined) {
    await payload.create({
      collection: "users",
      data: user,
      overrideAccess: true,
    });
    counts.created += 1;

    return;
  }

  // The password is rewritten too, so the credentials printed by the CLI are
  // always the ones that actually work — a developer who forgot theirs can
  // re-run the seed instead of resetting by hand.
  await payload.update({
    collection: "users",
    id: existing.id,
    data: user,
    overrideAccess: true,
  });
  counts.updated += 1;
}

export async function seed({
  payload,
  env = process.env,
  log = console.log,
}: SeedOptions): Promise<SeedSummary> {
  const summary: SeedSummary = {
    categories: emptyCounts(),
    gestures: emptyCounts(),
    users: emptyCounts(),
    categoryIds: {},
    gestureIds: {},
  };

  for (const fixture of categoryFixtures) {
    summary.categoryIds[fixture.name] = await upsertCategory(
      payload,
      fixture,
      summary.categories
    );
  }
  log(
    `categories: ${summary.categories.created} created, ${summary.categories.updated} updated`
  );

  for (const fixture of gestureFixtures) {
    summary.gestureIds[fixture.name] = await upsertGesture(
      payload,
      fixture,
      summary.categoryIds,
      summary.gestures
    );
  }
  log(
    `gestures: ${summary.gestures.created} created, ${summary.gestures.updated} updated`
  );

  for (const user of seedUsersFromEnv(env)) {
    await upsertUser(payload, user, summary.users);
    log(`user: ${user.email} (${user.role})`);
  }
  log(
    `users: ${summary.users.created} created, ${summary.users.updated} updated`
  );

  return summary;
}
