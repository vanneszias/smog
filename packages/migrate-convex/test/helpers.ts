import { readExportDirectory } from "../src/cli/read-export";
import type { ExportFiles } from "../src/core/export-schema";

/** The minimal export fixture (one row per table, phase 8 task 5). */
export const FIXTURE_DIR = new URL("./fixtures/export", import.meta.url)
  .pathname;

export function fixtureExport(): Promise<ExportFiles> {
  return readExportDirectory(FIXTURE_DIR);
}

/** One JSONL line per row. */
export function jsonl(rows: readonly unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

/**
 * Personal and secret values of the fixture: none may appear in a staging
 * plan, and none in anything the importer prints.
 */
export const FIXTURE_SECRETS = [
  "ada.fixture@example.test",
  "bea.fixture@example.test",
  "factuur.fixture@example.test",
  "Bea Fixture",
  "Fixture Bakkerij",
  "BE0403170701",
  "fixture-reedit-token-0001",
  "fixture-view-token-0001",
  "192.0.2.10",
  "FixtureAgent",
  "user_01FIXTUREADA",
] as const;
