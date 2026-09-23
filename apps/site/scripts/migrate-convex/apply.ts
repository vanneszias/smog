/**
 * Applies an `ImportPlan` (see `plan.ts`) to Payload through the local API.
 *
 * ## Idempotent and resumable, with no transactions
 *
 * `sqliteD1Adapter` has no transactions, so a run can stop anywhere. What
 * makes a rerun converge instead of duplicating is `legacyId` — the Convex
 * `_id` — and the UNIQUE index behind it on both collections, which is the
 * one atomic primitive this adapter has (see `lib/claims.ts` and
 * `20260922_100000_add_rate_limits.ts`).
 *
 * Every document is looked up by `legacyId` first. Found: counted `existing`
 * and left exactly as it is — never updated, so an editor's change after a
 * first run survives every rerun. Absent: created. The lookup and the create
 * are two statements, so a second run working at the same moment can insert
 * the row in between; that create then fails on the unique index and is
 * re-read and counted `existing`, because the document it wanted is there.
 *
 * ## Recognising the unique-index conflict
 *
 * `@payloadcms/drizzle`'s `handleUpsertError` would turn a unique violation
 * into a `ValidationError`, but only when the driver sets
 * `code === 'SQLITE_CONSTRAINT_UNIQUE'`, and D1 sets no `code` at all.
 * Measured on this adapter (3.89.0), a duplicate `legacy_id` throws a
 * `DrizzleQueryError` (`Failed query: insert into "categories" …`, no `code`)
 * whose `cause` is `Error("D1_ERROR: UNIQUE constraint failed:
 * categories.legacy_id: SQLITE_CONSTRAINT (extended:
 * SQLITE_CONSTRAINT_UNIQUE)")`, whose own `cause` is the same text without
 * the `D1_ERROR: ` prefix. The message is the only discriminator, so
 * {@link isLegacyIdConflict} matches it anchored and for this table's
 * `legacy_id` column only — and even then the conflict is *confirmed* by
 * reading the row back before anything is counted `existing`.
 *
 * ## A failed create can still leave a row
 *
 * Payload writes a document as several statements (the row, its locales,
 * its `hasMany` text, its relationships). Without a transaction, a failure
 * after the first leaves a row carrying the `legacyId`, which a rerun would
 * count as `existing` and never touch. So any other failure also looks the
 * `legacyId` up, and if a row is there the failure says so and names it.
 *
 * ## What a create triggers
 *
 * A gesture create runs the search plugin's afterChange hook, which creates
 * one `search` entry per create without looking for an existing one. The
 * index therefore stays one-entry-per-gesture only because a rerun never
 * re-creates a gesture — the same property that keeps the gestures unique.
 * Nothing here reads or writes `user-consents`, and the CLI holds
 * {@link forbidConsentWrites} over the whole run so nothing it calls can.
 */

import type { Payload } from "payload";
import type { ImportPlan } from "./plan";

export interface ApplyResult {
  categories: {
    created: number;
    existing: number;
    failed: Array<{ legacyId: string; error: string }>;
  };
  gestures: {
    created: number;
    existing: number;
    failed: Array<{ legacyId: string; error: string }>;
    skippedForFailedCategory: string[];
  };
}

type ImportedCollection = "categories" | "gestures";

interface Outcome {
  kind: "created" | "existing";
  id: number;
}

/** The locale the catalogue is imported into; `en`/`fr` fall back to it. */
const IMPORT_LOCALE = "nl";

/** Bounded by the unique index to one match; never an unbounded read. */
async function findIdByLegacyId(
  payload: Payload,
  collection: ImportedCollection,
  legacyId: string
): Promise<number | undefined> {
  const { docs } = await payload.find({
    collection,
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    select: { legacyId: true },
    where: { legacyId: { equals: legacyId } },
  });
  return docs[0]?.id;
}

/**
 * True when `error`, or an error in its `cause` chain, is SQLite's UNIQUE
 * violation on `<collection>.legacy_id` — and on nothing else. Anchored at
 * the start of the message, so the wrapping `DrizzleQueryError`, whose
 * message echoes the query's parameters, can never match on its contents.
 */
function isLegacyIdConflict(
  error: unknown,
  collection: ImportedCollection
): boolean {
  const pattern = new RegExp(
    `^(?:D1_ERROR: )?UNIQUE constraint failed: ${collection}\\.legacy_id(?![\\w])`
  );
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 10; depth += 1) {
    if (pattern.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Looks `legacyId` up, creates the document if it is absent, and settles a
 * failed create by reading the row back. Throws, with a message fit for the
 * report, when the document could not be imported.
 */
async function importOne(
  payload: Payload,
  collection: ImportedCollection,
  legacyId: string,
  create: () => Promise<{ id: number }>
): Promise<Outcome> {
  const existingId = await findIdByLegacyId(payload, collection, legacyId);
  if (existingId !== undefined) {
    return { kind: "existing", id: existingId };
  }

  try {
    const created = await create();
    return { kind: "created", id: created.id };
  } catch (error) {
    const presentId = await findIdByLegacyId(payload, collection, legacyId);
    if (presentId !== undefined && isLegacyIdConflict(error, collection)) {
      return { kind: "existing", id: presentId };
    }
    if (presentId !== undefined) {
      throw new Error(
        `${messageOf(error)} (the failed create left document ${presentId} with this legacyId; a rerun will count it as existing, so check or delete it first)`,
        { cause: error }
      );
    }
    throw error;
  }
}

export async function applyPlan(
  payload: Payload,
  plan: ImportPlan,
  options: { log: (line: string) => void }
): Promise<ApplyResult> {
  const { log } = options;
  const result: ApplyResult = {
    categories: { created: 0, existing: 0, failed: [] },
    gestures: {
      created: 0,
      existing: 0,
      failed: [],
      skippedForFailedCategory: [],
    },
  };

  // Every category present after this loop, created now or by an earlier
  // run, keyed by legacy id. A category missing here is one that failed.
  const categoryIds = new Map<string, number>();

  for (const category of plan.categories) {
    try {
      const outcome = await importOne(
        payload,
        "categories",
        category.legacyId,
        () =>
          payload.create({
            collection: "categories",
            locale: IMPORT_LOCALE,
            overrideAccess: true,
            depth: 0,
            data: {
              legacyId: category.legacyId,
              name: category.name,
              isActive: category.isActive,
              createdAt: category.createdAt,
            },
          })
      );
      categoryIds.set(category.legacyId, outcome.id);
      result.categories[outcome.kind] += 1;
      log(`category ${category.legacyId} "${category.name}": ${outcome.kind}`);
    } catch (error) {
      console.error(
        `[migrate-convex] Failed to import category ${category.legacyId}:`,
        error
      );
      result.categories.failed.push({
        legacyId: category.legacyId,
        error: messageOf(error),
      });
      log(`category ${category.legacyId} "${category.name}": FAILED`);
    }
  }

  for (const gesture of plan.gestures) {
    const linked = gesture.categoryLegacyIds.map((legacyId) =>
      categoryIds.get(legacyId)
    );
    // Never created with fewer categories than the source had.
    if (linked.some((id) => id === undefined)) {
      result.gestures.skippedForFailedCategory.push(gesture.legacyId);
      log(
        `gesture ${gesture.legacyId} "${gesture.name}": skipped, a category it needs failed`
      );
      continue;
    }
    const categories = linked as number[];

    try {
      const outcome = await importOne(
        payload,
        "gestures",
        gesture.legacyId,
        () =>
          payload.create({
            collection: "gestures",
            locale: IMPORT_LOCALE,
            overrideAccess: true,
            depth: 0,
            data: {
              legacyId: gesture.legacyId,
              name: gesture.name,
              info: gesture.info,
              concepts: gesture.concepts,
              categories,
              playbackId: gesture.playbackId,
              isActive: gesture.isActive,
              createdAt: gesture.createdAt,
            },
          })
      );
      result.gestures[outcome.kind] += 1;
      log(`gesture ${gesture.legacyId} "${gesture.name}": ${outcome.kind}`);
    } catch (error) {
      console.error(
        `[migrate-convex] Failed to import gesture ${gesture.legacyId}:`,
        error
      );
      result.gestures.failed.push({
        legacyId: gesture.legacyId,
        error: messageOf(error),
      });
      log(`gesture ${gesture.legacyId} "${gesture.name}": FAILED`);
    }
  }

  return result;
}

const CONSENT_REFUSAL =
  "[migrate-convex] the importer must not write consent records";

/**
 * Makes every consent create, update and delete throw until the returned
 * function is called. No consent is imported, ever (spec), and nothing the
 * importer calls should write one; this turns "should" into a refusal, on
 * the Payload instance the run uses, rather than a count compared after
 * the fact. The hooks run inside Payload's own operations (`beforeChange`
 * for create and update, `beforeDelete` for delete), so nothing that goes
 * through the local API gets past them.
 *
 * Always release it: the instance is cached per process, and in the test
 * runner shared by every file a worker runs.
 */
export function forbidConsentWrites(payload: Payload): () => void {
  const hooks = payload.collections["user-consents"].config.hooks;
  const refuseChange = (): never => {
    throw new Error(CONSENT_REFUSAL);
  };
  const refuseDelete = (): never => {
    throw new Error(CONSENT_REFUSAL);
  };
  hooks.beforeChange = [...(hooks.beforeChange ?? []), refuseChange];
  hooks.beforeDelete = [...(hooks.beforeDelete ?? []), refuseDelete];

  return () => {
    hooks.beforeChange = (hooks.beforeChange ?? []).filter(
      (hook) => hook !== refuseChange
    );
    hooks.beforeDelete = (hooks.beforeDelete ?? []).filter(
      (hook) => hook !== refuseDelete
    );
  };
}
