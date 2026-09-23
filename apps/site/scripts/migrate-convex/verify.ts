/**
 * Re-reads the target after an import and checks it against the plan. Runs
 * on every `--apply`, reruns included, so a document an earlier run left
 * half-written surfaces even after that run's report is gone.
 *
 * ## Why presence is not enough
 *
 * Payload's D1 create is several statements with no transaction, in this
 * order (`@payloadcms/drizzle` `upsertRow`, 3.89.0): the main row, its
 * `_locales` row (the Dutch `name`), its `_rels` (the categories), its
 * hasMany `_texts` (the concepts) — and only after all of those the search
 * plugin's afterChange, which creates the `search` entry and swallows its
 * own errors. A failure part-way leaves a row carrying the `legacyId`,
 * which the importer then counts `existing` and never touches again.
 *
 * ## Incomplete, mismatched, or an editor's change
 *
 * Editors may legitimately rename a gesture, re-categorise it, clear its
 * concepts or deactivate it after a first run, and a rerun must not call
 * that a failure. So the checks split by what could have produced them:
 *
 * - **Incomplete** (fails; "delete and rerun") — states no legal save can
 *   produce, because validation forbids them or only the import writes
 *   them: an empty Dutch `name` (`defaultLocaleRequired`), a gesture with no
 *   categories (`required`), and a gesture without exactly one `search`
 *   entry (the plugin writes one per create and re-syncs it on every save).
 *   Given the statement order above, every prefix of a failed create lands
 *   in one of these: no `_locales` → empty name; no `_rels` → no
 *   categories; no `_texts` or a swallowed search failure → no search
 *   entry, because afterChange never ran or did not write. A missing-
 *   concepts document therefore needs no concepts check of its own to be
 *   caught — which matters, because an editor may clear concepts.
 * - **Mismatch** (fails) — a planned document that is absent; a document
 *   created by this run whose name, categories, concepts or active flag
 *   differ from the plan (nobody else has had the chance to change it, so
 *   the difference is the import's own); a count that disagrees.
 *
 * Each incomplete entry carries a remedy. The default is "delete and
 * rerun": the importer never updates, so only a fresh create makes the
 * document whole. The exception is a gesture that existed before this run
 * and whose *only* fault is its search-entry count: the document itself is
 * whole and may carry an editor's work, and a save (or the search
 * collection's Reindex) rebuilds its one entry — the plugin's afterChange
 * updates the first entry and deletes any duplicates.
 *
 * The `user-consents` count before and after is reported as information.
 * It is not a check: the CLI refuses consent writes for the whole run
 * (`forbidConsentWrites` in `./apply`), and on a live database other
 * writers could move the count without the import having done anything.
 * - **Differs from the export** (reported, does not fail) — the same
 *   comparisons on a document that *existed before this run*. It belongs
 *   to the editors now; the report shows the difference so an operator can
 *   tell an editor's change from something stranger, but the rerun passes.
 *
 * Which documents existed before the run is read by
 * {@link snapshotBeforeRun}, before `applyPlan` writes anything.
 *
 * The counts follow the same rule: the expected per-category gesture
 * counts and active counts take the plan's values for documents this run
 * created and the document as it stands for one that pre-existed, so an
 * editor's re-categorisation cannot fail a rerun, while anything this run
 * wrote wrong still does.
 *
 * Every read is paged at {@link CHUNK} legacy ids or document ids, under
 * D1's cap of 100 bound parameters per statement.
 */

import type { Payload } from "payload";
import type { ImportPlan } from "./plan";

/** Ids per `in` query: under D1's 100-parameter cap with room for the rest. */
const CHUNK = 50;
/** Search entries per page when tallying them for a chunk of gestures. */
const SEARCH_PAGE = 100;
const IMPORT_LOCALE = "nl";

type ImportedCollection = "categories" | "gestures";

interface RunSnapshot {
  preexisting: { categories: Set<string>; gestures: Set<string> };
  userConsents: number;
}

export interface VerifyResult {
  ok: boolean;
  incomplete: Array<{
    collection: ImportedCollection;
    legacyId: string;
    name: string;
    check: string;
    remedy: Remedy;
  }>;
  mismatches: Array<{
    subject: ImportedCollection | "counts";
    legacyId?: string;
    name?: string;
    problem: string;
  }>;
  differs: Array<{
    collection: ImportedCollection;
    legacyId: string;
    name: string;
    field: "name" | "categories" | "concepts" | "isActive";
    detail: string;
  }>;
  counts: {
    perCategory: Array<{
      legacyId: string;
      name: string;
      expected: number;
      actual: number;
    }>;
    activeCategories: { expected: number; actual: number };
    activeGestures: { expected: number; actual: number };
    userConsents: { before: number; after: number };
  };
}

type Remedy = "delete and rerun" | "re-save or reindex the gesture";

const SEARCH_CHECK_PREFIX = "search entries:";

interface CategoryRow {
  id: number;
  name: string;
  isActive: boolean;
}

interface GestureRow {
  id: number;
  name: string;
  categoryIds: number[];
  concepts: string[];
  isActive: boolean;
}

function chunks<T>(items: T[], size: number = CHUNK): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

async function presentLegacyIds(
  payload: Payload,
  collection: ImportedCollection,
  legacyIds: string[]
): Promise<Set<string>> {
  const present = new Set<string>();
  for (const chunk of chunks(legacyIds)) {
    const { docs } = await payload.find({
      collection,
      depth: 0,
      limit: chunk.length,
      pagination: false,
      overrideAccess: true,
      select: { legacyId: true },
      where: { legacyId: { in: chunk } },
    });
    for (const doc of docs) {
      if (doc.legacyId) {
        present.add(doc.legacyId);
      }
    }
  }
  return present;
}

async function countUserConsents(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: "user-consents",
    overrideAccess: true,
  });
  return totalDocs;
}

/** What the target holds before `applyPlan` runs; see the module doc. */
export async function snapshotBeforeRun(
  payload: Payload,
  plan: ImportPlan
): Promise<RunSnapshot> {
  return {
    preexisting: {
      categories: await presentLegacyIds(
        payload,
        "categories",
        plan.categories.map((entry) => entry.legacyId)
      ),
      gestures: await presentLegacyIds(
        payload,
        "gestures",
        plan.gestures.map((entry) => entry.legacyId)
      ),
    },
    userConsents: await countUserConsents(payload),
  };
}

async function readCategories(
  payload: Payload,
  legacyIds: string[]
): Promise<Map<string, CategoryRow>> {
  const rows = new Map<string, CategoryRow>();
  for (const chunk of chunks(legacyIds)) {
    const { docs } = await payload.find({
      collection: "categories",
      depth: 0,
      limit: chunk.length,
      pagination: false,
      locale: IMPORT_LOCALE,
      overrideAccess: true,
      select: { legacyId: true, name: true, isActive: true },
      where: { legacyId: { in: chunk } },
    });
    for (const doc of docs) {
      if (doc.legacyId) {
        rows.set(doc.legacyId, {
          id: doc.id,
          name: doc.name ?? "",
          isActive: doc.isActive === true,
        });
      }
    }
  }
  return rows;
}

async function readGestures(
  payload: Payload,
  legacyIds: string[]
): Promise<Map<string, GestureRow>> {
  const rows = new Map<string, GestureRow>();
  for (const chunk of chunks(legacyIds)) {
    const { docs } = await payload.find({
      collection: "gestures",
      depth: 0,
      limit: chunk.length,
      pagination: false,
      locale: IMPORT_LOCALE,
      overrideAccess: true,
      select: {
        legacyId: true,
        name: true,
        categories: true,
        concepts: true,
        isActive: true,
      },
      where: { legacyId: { in: chunk } },
    });
    for (const doc of docs) {
      if (doc.legacyId) {
        rows.set(doc.legacyId, {
          id: doc.id,
          name: doc.name ?? "",
          categoryIds: (doc.categories ?? []).map((entry) =>
            typeof entry === "number" ? entry : entry.id
          ),
          concepts: doc.concepts ?? [],
          isActive: doc.isActive === true,
        });
      }
    }
  }
  return rows;
}

/** Search entries per gesture id, every page read, so a duplicate counts. */
async function countSearchEntries(
  payload: Payload,
  gestureIds: number[]
): Promise<Map<number, number>> {
  const tally = new Map<number, number>();
  for (const chunk of chunks(gestureIds)) {
    for (let page = 1; ; page += 1) {
      const result = await payload.find({
        collection: "search",
        depth: 0,
        limit: SEARCH_PAGE,
        page,
        overrideAccess: true,
        select: { doc: true },
        where: {
          "doc.relationTo": { equals: "gestures" },
          "doc.value": { in: chunk },
        },
      });
      for (const entry of result.docs) {
        const value = entry.doc?.value;
        const id = typeof value === "number" ? value : value?.id;
        if (id !== undefined) {
          tally.set(id, (tally.get(id) ?? 0) + 1);
        }
      }
      if (!result.hasNextPage) {
        break;
      }
    }
  }
  return tally;
}

const isBlank = (value: string): boolean => value.trim().length === 0;

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

const sameSet = (a: string[], b: string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
};

const show = (value: unknown): string => JSON.stringify(value);

type Field = VerifyResult["differs"][number]["field"];

/** Collects findings; a difference is routed by whether the run created it. */
class Findings {
  readonly incomplete: VerifyResult["incomplete"] = [];
  readonly mismatches: VerifyResult["mismatches"] = [];
  readonly differs: VerifyResult["differs"] = [];
  private readonly before: RunSnapshot;

  constructor(before: RunSnapshot) {
    this.before = before;
  }

  existedBefore(collection: ImportedCollection, legacyId: string): boolean {
    return this.before.preexisting[collection].has(legacyId);
  }

  missing(
    collection: ImportedCollection,
    entry: { legacyId: string; name: string }
  ): void {
    this.mismatches.push({
      subject: collection,
      ...entry,
      problem: "missing from the target",
    });
  }

  /**
   * A difference from the plan: the import's own fault on a document this
   * run created, an editor's business on one that was already there.
   */
  difference(
    collection: ImportedCollection,
    entry: { legacyId: string; name: string },
    field: Field,
    expected: unknown,
    actual: unknown
  ): void {
    const detail = `plan ${show(expected)}, target ${show(actual)}`;
    if (this.existedBefore(collection, entry.legacyId)) {
      this.differs.push({ collection, ...entry, field, detail });
    } else {
      this.mismatches.push({
        subject: collection,
        ...entry,
        problem: `${field} differs from the plan: ${detail}`,
      });
    }
  }
}

function checkCategories(
  plan: ImportPlan,
  categories: Map<string, CategoryRow>,
  findings: Findings
): void {
  for (const planned of plan.categories) {
    const entry = { legacyId: planned.legacyId, name: planned.name };
    const row = categories.get(planned.legacyId);
    if (row === undefined) {
      findings.missing("categories", entry);
      continue;
    }
    if (isBlank(row.name)) {
      findings.incomplete.push({
        collection: "categories",
        ...entry,
        check: "empty nl name",
        remedy: "delete and rerun",
      });
      continue;
    }
    if (row.name !== planned.name) {
      findings.difference("categories", entry, "name", planned.name, row.name);
    }
    if (row.isActive !== planned.isActive) {
      findings.difference(
        "categories",
        entry,
        "isActive",
        planned.isActive,
        row.isActive
      );
    }
  }
}

/** The states no legal save leaves a gesture in; see the module doc. */
function incompleteChecks(row: GestureRow, searchEntries: number): string[] {
  const checks: string[] = [];
  if (isBlank(row.name)) {
    checks.push("empty nl name");
  }
  if (row.categoryIds.length === 0) {
    checks.push("no categories");
  }
  if (searchEntries !== 1) {
    checks.push(`${SEARCH_CHECK_PREFIX} ${searchEntries} (expected 1)`);
  }
  return checks;
}

function compareGesture(
  planned: ImportPlan["gestures"][number],
  row: GestureRow,
  categoryKeys: string[],
  findings: Findings
): void {
  const entry = { legacyId: planned.legacyId, name: planned.name };
  if (row.name !== planned.name) {
    findings.difference("gestures", entry, "name", planned.name, row.name);
  }
  if (!sameSet(categoryKeys, planned.categoryLegacyIds)) {
    findings.difference(
      "gestures",
      entry,
      "categories",
      planned.categoryLegacyIds,
      categoryKeys
    );
  }
  if (!sameList(row.concepts, planned.concepts)) {
    findings.difference(
      "gestures",
      entry,
      "concepts",
      planned.concepts,
      row.concepts
    );
  }
  if (row.isActive !== planned.isActive) {
    findings.difference(
      "gestures",
      entry,
      "isActive",
      planned.isActive,
      row.isActive
    );
  }
}

function checkGestures(
  plan: ImportPlan,
  gestures: Map<string, GestureRow>,
  searchEntries: Map<number, number>,
  categoryKeys: (row: GestureRow) => string[],
  findings: Findings
): void {
  for (const planned of plan.gestures) {
    const entry = { legacyId: planned.legacyId, name: planned.name };
    const row = gestures.get(planned.legacyId);
    if (row === undefined) {
      findings.missing("gestures", entry);
      continue;
    }
    const checks = incompleteChecks(row, searchEntries.get(row.id) ?? 0);
    if (checks.length > 0) {
      // Listed once, as incomplete: comparing a half-written document
      // with the plan would only repeat what is missing.
      const searchOnly = checks.every((check) =>
        check.startsWith(SEARCH_CHECK_PREFIX)
      );
      const remedy: Remedy =
        searchOnly && findings.existedBefore("gestures", planned.legacyId)
          ? "re-save or reindex the gesture"
          : "delete and rerun";
      for (const check of checks) {
        findings.incomplete.push({
          collection: "gestures",
          ...entry,
          check,
          remedy,
        });
      }
      continue;
    }
    compareGesture(planned, row, categoryKeys(row), findings);
  }
}

/**
 * Expected counts take the plan for what this run created and the target
 * as it stands for what already existed (see the module doc).
 */
function countDocuments(
  plan: ImportPlan,
  categories: Map<string, CategoryRow>,
  gestures: Map<string, GestureRow>,
  categoryKeys: (row: GestureRow) => string[],
  findings: Findings
): Omit<VerifyResult["counts"], "userConsents"> {
  const gestureKeys = plan.gestures.map((planned) => {
    const row = gestures.get(planned.legacyId);
    const actual = row ? categoryKeys(row) : [];
    const kept = row && findings.existedBefore("gestures", planned.legacyId);
    return { actual, expected: kept ? actual : planned.categoryLegacyIds };
  });

  const perCategory = plan.categories.map((planned) => ({
    legacyId: planned.legacyId,
    name: planned.name,
    expected: gestureKeys.filter((keys) =>
      keys.expected.includes(planned.legacyId)
    ).length,
    actual: gestureKeys.filter((keys) => keys.actual.includes(planned.legacyId))
      .length,
  }));

  const activeCount = (
    collection: ImportedCollection,
    planned: Array<{ legacyId: string; isActive: boolean }>,
    rows: Map<string, { isActive: boolean }>
  ): { expected: number; actual: number } => {
    let expected = 0;
    let actual = 0;
    for (const entry of planned) {
      const row = rows.get(entry.legacyId);
      const kept = row && findings.existedBefore(collection, entry.legacyId);
      expected += (kept ? row.isActive : entry.isActive) ? 1 : 0;
      actual += row?.isActive ? 1 : 0;
    }
    return { expected, actual };
  };

  return {
    perCategory,
    activeCategories: activeCount("categories", plan.categories, categories),
    activeGestures: activeCount("gestures", plan.gestures, gestures),
  };
}

function countMismatches(
  counts: Omit<VerifyResult["counts"], "userConsents">,
  findings: Findings
): void {
  for (const count of counts.perCategory) {
    if (count.expected !== count.actual) {
      findings.mismatches.push({
        subject: "counts",
        problem: `gestures in category ${count.legacyId} "${count.name}": expected ${count.expected}, found ${count.actual}`,
      });
    }
  }
  for (const [label, count] of [
    ["active categories", counts.activeCategories],
    ["active gestures", counts.activeGestures],
  ] as const) {
    if (count.expected !== count.actual) {
      findings.mismatches.push({
        subject: "counts",
        problem: `${label}: expected ${count.expected}, found ${count.actual}`,
      });
    }
  }
}

export async function verify(
  payload: Payload,
  plan: ImportPlan,
  before: RunSnapshot
): Promise<VerifyResult> {
  const findings = new Findings(before);

  const categories = await readCategories(
    payload,
    plan.categories.map((entry) => entry.legacyId)
  );
  const legacyIdOfCategory = new Map<number, string>();
  for (const [legacyId, row] of categories) {
    legacyIdOfCategory.set(row.id, legacyId);
  }
  /** A gesture's categories as legacy ids; one not from the plan as `#id`. */
  const categoryKeys = (row: GestureRow): string[] =>
    row.categoryIds.map((id) => legacyIdOfCategory.get(id) ?? `#${id}`);

  const gestures = await readGestures(
    payload,
    plan.gestures.map((entry) => entry.legacyId)
  );
  const searchEntries = await countSearchEntries(
    payload,
    [...gestures.values()].map((row) => row.id)
  );

  checkCategories(plan, categories, findings);
  checkGestures(plan, gestures, searchEntries, categoryKeys, findings);
  const counts = countDocuments(
    plan,
    categories,
    gestures,
    categoryKeys,
    findings
  );
  countMismatches(counts, findings);

  // Information only; see the module doc.
  const userConsentsAfter = await countUserConsents(payload);

  return {
    ok: findings.incomplete.length === 0 && findings.mismatches.length === 0,
    incomplete: findings.incomplete,
    mismatches: findings.mismatches,
    differs: findings.differs,
    counts: {
      ...counts,
      userConsents: { before: before.userConsents, after: userConsentsAfter },
    },
  };
}
