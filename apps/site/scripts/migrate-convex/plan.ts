/**
 * Pure reader and planner for the Convex → Payload catalogue import.
 *
 * `readExport` parses a Convex export directory (one `<table>/documents.jsonl`
 * file per table, plus `_tables/documents.jsonl` listing the tables that
 * exist) into typed rows. `buildPlan` turns those rows into an `ImportPlan`
 * that `./apply` applies through Payload's local API.
 *
 * Both functions are pure I/O-in, data-out: no Payload, no network, no
 * writes. `readExport` never logs a row's content, only file paths and line
 * numbers, and tables that must not be migrated (`users`, `sponsorships`,
 * `user_consents`, `adminLogs`, `user_favorites`) are counted by line only —
 * their fields are never parsed or read.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

interface ExportCategory {
  _id: string;
  _creationTime: number;
  name: string;
  isActive: boolean;
}

interface ExportGesture {
  _id: string;
  _creationTime: number;
  name: string;
  info: string;
  concept: string[];
  categoryIds: string[];
  playbackId: string;
  lastUpdated: number;
  isActive: boolean;
}

type SkipReason = "no-category" | "no-playback-id" | "unknown-category";

type CatalogueTable = "categories" | "gestures";

export interface ImportPlan {
  categories: Array<{
    legacyId: string;
    name: string;
    isActive: boolean;
    createdAt: string;
  }>;
  gestures: Array<{
    legacyId: string;
    name: string;
    info: string;
    concepts: string[];
    categoryLegacyIds: string[];
    playbackId: string;
    isActive: boolean;
    createdAt: string;
  }>;
  skipped: Array<{ legacyId: string; name: string; reason: SkipReason }>;
  dropped: { favourites: number };
  counts: Record<
    | "categories"
    | "gestures"
    | "user_favorites"
    | "users"
    | "sponsorships"
    | "user_consents"
    | "adminLogs",
    number
  >;
}

// Aggregate-only tables: the export's shape is only ever consulted for a
// count, never for the rows themselves. `readExport` counts their non-blank
// lines and never calls JSON.parse on them, so malformed or unreadable rows
// there can never throw or leak into an error message.
const AGGREGATE_ONLY_TABLES = [
  "user_favorites",
  "users",
  "sponsorships",
  "user_consents",
  "adminLogs",
] as const;

function tableFile(dir: string, table: string): string {
  return path.join(dir, table, "documents.jsonl");
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Reads `<dir>/<table>/documents.jsonl`, refusing a missing table outright
 * rather than treating it as empty. A present-but-empty file is still a
 * valid zero; only a missing directory or file is a refusal. The error
 * names the table and the path, nothing from the export's rows.
 */
async function readRequiredFile(dir: string, table: string): Promise<string> {
  const filePath = tableFile(dir, table);
  const content = await readFileIfExists(filePath);
  if (content === undefined) {
    throw new Error(
      `[migrate-convex] Export is missing ${table}/documents.jsonl at ${filePath}`
    );
  }
  return content;
}

/** Non-blank, 1-indexed lines, paired with their line number in the file. */
function splitLines(
  content: string
): Array<{ line: string; lineNumber: number }> {
  return content
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0);
}

/**
 * Parses every non-blank line of `<dir>/<table>/documents.jsonl` as JSON,
 * keeping each row's line number so a later refusal can point at it.
 */
async function readJsonlTable<T>(
  dir: string,
  table: string
): Promise<{ rows: T[]; lineNumbers: number[] }> {
  const filePath = tableFile(dir, table);
  const content = await readRequiredFile(dir, table);

  const rows: T[] = [];
  const lineNumbers: number[] = [];
  for (const { line, lineNumber } of splitLines(content)) {
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      throw new Error(
        `[migrate-convex] Malformed JSON in ${filePath}:${lineNumber}`
      );
    }
    lineNumbers.push(lineNumber);
  }
  return { rows, lineNumbers };
}

/**
 * Counts the non-blank lines of `<dir>/<table>/documents.jsonl` without
 * parsing them. Used for tables this import never reads beyond a count.
 */
async function countJsonlLines(dir: string, table: string): Promise<number> {
  const content = await readRequiredFile(dir, table);
  return splitLines(content).length;
}

/** Reads the table names listed in `_tables/documents.jsonl`. */
async function readTableNames(dir: string): Promise<string[]> {
  const filePath = tableFile(dir, "_tables");
  const content = await readRequiredFile(dir, "_tables");

  const names: string[] = [];
  for (const { line, lineNumber } of splitLines(content)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(
        `[migrate-convex] Malformed JSON in ${filePath}:${lineNumber}`
      );
    }
    const name = (parsed as { name?: unknown }).name;
    if (typeof name === "string") {
      names.push(name);
    }
  }
  return names;
}

export async function readExport(dir: string): Promise<{
  categories: ExportCategory[];
  gestures: ExportGesture[];
  /** Each row's line in its `documents.jsonl`, index for index. */
  lineNumbers: Record<CatalogueTable, number[]>;
  counts: ImportPlan["counts"];
  tables: string[];
}> {
  const tables = await readTableNames(dir);
  const categoryTable = await readJsonlTable<ExportCategory>(dir, "categories");
  const gestureTable = await readJsonlTable<ExportGesture>(dir, "gestures");
  const categories = categoryTable.rows;
  const gestures = gestureTable.rows;

  const aggregateCounts = await Promise.all(
    AGGREGATE_ONLY_TABLES.map((table) => countJsonlLines(dir, table))
  );

  const counts = {
    categories: categories.length,
    gestures: gestures.length,
  } as ImportPlan["counts"];
  AGGREGATE_ONLY_TABLES.forEach((table, index) => {
    counts[table] = aggregateCounts[index];
  });

  return {
    categories,
    gestures,
    lineNumbers: {
      categories: categoryTable.lineNumbers,
      gestures: gestureTable.lineNumbers,
    },
    counts,
    tables,
  };
}

// Tables this import refuses to run against if the export has any rows in
// them (Global Constraints: "Refuse to run if any of ... is non-empty").
const REFUSAL_TABLES: Array<{
  key: (typeof AGGREGATE_ONLY_TABLES)[number];
  label: string;
}> = [
  { key: "users", label: "users" },
  { key: "sponsorships", label: "sponsorships" },
  { key: "user_consents", label: "user_consents" },
  { key: "adminLogs", label: "adminLogs" },
];

/** Keeps first-occurrence order, drops repeats. */
function dedupe(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function refuseOnNonMigratableData(
  counts: ImportPlan["counts"],
  tables: string[]
): void {
  for (const { key, label } of REFUSAL_TABLES) {
    const count = counts[key];
    if (count > 0) {
      throw new Error(
        `[migrate-convex] Export has ${count} ${label}, refusing import`
      );
    }
  }
  if (tables.includes("gesture_lists")) {
    throw new Error(
      "[migrate-convex] Export has a gesture_lists table, refusing import"
    );
  }
}

/** "2 and 4", "1, 2 and 3". */
function listLines(lines: number[]): string {
  const head = lines.slice(0, -1).join(", ");
  return lines.length > 1 ? `${head} and ${lines.at(-1)}` : String(lines[0]);
}

/**
 * Refuses a table in which two rows share an `_id`: which one is the real
 * document is not this import's call to make. The error names the table
 * and the lines, never the id or anything else from the rows.
 */
function refuseDuplicateIds(
  table: CatalogueTable,
  rows: Array<{ _id: string }>,
  lineNumbers: number[]
): void {
  const linesById = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const lines = linesById.get(row._id) ?? [];
    lines.push(lineNumbers[index] ?? index + 1);
    linesById.set(row._id, lines);
  });
  const duplicates = [...linesById.values()].filter(
    (lines) => lines.length > 1
  );
  if (duplicates.length > 0) {
    throw new Error(
      `[migrate-convex] Export has duplicate _id rows in ${table}/documents.jsonl at lines ${duplicates.map(listLines).join("; lines ")}, refusing import`
    );
  }
}

type GestureOutcome =
  | { kind: "skip"; entry: ImportPlan["skipped"][number] }
  | { kind: "import"; entry: ImportPlan["gestures"][number] };

/**
 * Applies every per-gesture rule: dedupes `categoryIds` (keep order) before
 * any check, skips `no-category` / `no-playback-id` / `unknown-category`,
 * then trims, drops empty, and dedupes concepts (keep order). The playback
 * id is stored trimmed, exactly as it is checked.
 */
function planGesture(
  gesture: ExportGesture,
  knownCategoryIds: Set<string>
): GestureOutcome {
  const name = gesture.name.trim();
  const categoryIds = dedupe(gesture.categoryIds);

  if (categoryIds.length === 0) {
    return {
      kind: "skip",
      entry: { legacyId: gesture._id, name, reason: "no-category" },
    };
  }
  const playbackId = gesture.playbackId.trim();
  if (playbackId.length === 0) {
    return {
      kind: "skip",
      entry: { legacyId: gesture._id, name, reason: "no-playback-id" },
    };
  }
  if (categoryIds.some((id) => !knownCategoryIds.has(id))) {
    return {
      kind: "skip",
      entry: { legacyId: gesture._id, name, reason: "unknown-category" },
    };
  }

  const concepts = dedupe(
    gesture.concept
      .map((concept) => concept.trim())
      .filter((concept) => concept.length > 0)
  );

  return {
    kind: "import",
    entry: {
      legacyId: gesture._id,
      name,
      info: gesture.info,
      concepts,
      categoryLegacyIds: categoryIds,
      playbackId,
      isActive: gesture.isActive,
      createdAt: new Date(gesture._creationTime).toISOString(),
    },
  };
}

export function buildPlan(
  input: Awaited<ReturnType<typeof readExport>>
): ImportPlan {
  refuseOnNonMigratableData(input.counts, input.tables);
  refuseDuplicateIds(
    "categories",
    input.categories,
    input.lineNumbers.categories
  );
  refuseDuplicateIds("gestures", input.gestures, input.lineNumbers.gestures);

  const categories: ImportPlan["categories"] = input.categories.map(
    (category) => ({
      legacyId: category._id,
      name: category.name.trim(),
      isActive: category.isActive,
      createdAt: new Date(category._creationTime).toISOString(),
    })
  );

  const knownCategoryIds = new Set(
    input.categories.map((category) => category._id)
  );

  const gestures: ImportPlan["gestures"] = [];
  const skipped: ImportPlan["skipped"] = [];

  for (const gesture of input.gestures) {
    const outcome = planGesture(gesture, knownCategoryIds);
    if (outcome.kind === "skip") {
      skipped.push(outcome.entry);
    } else {
      gestures.push(outcome.entry);
    }
  }

  return {
    categories,
    gestures,
    skipped,
    dropped: { favourites: input.counts.user_favorites },
    counts: input.counts,
  };
}
