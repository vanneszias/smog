/**
 * Pure reader and planner for the Stage 9 Convex → Payload catalogue import.
 *
 * `readExport` parses a Convex export directory (one `<table>/documents.jsonl`
 * file per table, plus `_tables/documents.jsonl` listing the tables that
 * exist) into typed rows. `buildPlan` turns those rows into an `ImportPlan`
 * that a later, effectful task applies through Payload's local API.
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

interface ImportPlan {
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

/** Non-blank, 1-indexed lines, paired with their line number in the file. */
function splitLines(
  content: string
): Array<{ line: string; lineNumber: number }> {
  return content
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0);
}

/** Parses every non-blank line of `<dir>/<table>/documents.jsonl` as JSON. */
async function readJsonlTable<T>(dir: string, table: string): Promise<T[]> {
  const filePath = tableFile(dir, table);
  const content = await readFileIfExists(filePath);
  if (content === undefined) {
    return [];
  }

  const rows: T[] = [];
  for (const { line, lineNumber } of splitLines(content)) {
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      throw new Error(
        `[migrate-convex] Malformed JSON in ${filePath}:${lineNumber}`
      );
    }
  }
  return rows;
}

/**
 * Counts the non-blank lines of `<dir>/<table>/documents.jsonl` without
 * parsing them. Used for tables this import never reads beyond a count.
 */
async function countJsonlLines(dir: string, table: string): Promise<number> {
  const content = await readFileIfExists(tableFile(dir, table));
  if (content === undefined) {
    return 0;
  }
  return splitLines(content).length;
}

/** Reads the table names listed in `_tables/documents.jsonl`. */
async function readTableNames(dir: string): Promise<string[]> {
  const filePath = tableFile(dir, "_tables");
  const content = await readFileIfExists(filePath);
  if (content === undefined) {
    return [];
  }

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
  counts: ImportPlan["counts"];
  tables: string[];
}> {
  const tables = await readTableNames(dir);
  const categories = await readJsonlTable<ExportCategory>(dir, "categories");
  const gestures = await readJsonlTable<ExportGesture>(dir, "gestures");

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

  return { categories, gestures, counts, tables };
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

export function buildPlan(
  input: Awaited<ReturnType<typeof readExport>>
): ImportPlan {
  for (const { key, label } of REFUSAL_TABLES) {
    const count = input.counts[key];
    if (count > 0) {
      throw new Error(
        `[migrate-convex] Export has ${count} ${label}, refusing import`
      );
    }
  }
  if (input.tables.includes("gesture_lists")) {
    throw new Error(
      "[migrate-convex] Export has a gesture_lists table, refusing import"
    );
  }

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
    const name = gesture.name.trim();

    if (gesture.categoryIds.length === 0) {
      skipped.push({ legacyId: gesture._id, name, reason: "no-category" });
      continue;
    }
    if (gesture.playbackId.trim().length === 0) {
      skipped.push({ legacyId: gesture._id, name, reason: "no-playback-id" });
      continue;
    }
    if (gesture.categoryIds.some((id) => !knownCategoryIds.has(id))) {
      skipped.push({
        legacyId: gesture._id,
        name,
        reason: "unknown-category",
      });
      continue;
    }

    const concepts: string[] = [];
    for (const concept of gesture.concept) {
      if (!concepts.includes(concept)) {
        concepts.push(concept);
      }
    }

    gestures.push({
      legacyId: gesture._id,
      name,
      info: gesture.info,
      concepts,
      categoryLegacyIds: gesture.categoryIds,
      playbackId: gesture.playbackId,
      isActive: gesture.isActive,
      createdAt: new Date(gesture._creationTime).toISOString(),
    });
  }

  return {
    categories,
    gestures,
    skipped,
    dropped: { favourites: input.counts.user_favorites },
    counts: input.counts,
  };
}
