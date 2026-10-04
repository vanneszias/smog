import { readExportDirectory } from "../src/cli/read-export";
import type { ExportFiles } from "../src/core/export-schema";
import { SPONSORSHIP_SECRETS } from "./sponsorship-fixtures";

/** The minimal export fixture (one row per table, phase 8 task 5). */
export const FIXTURE_DIR = new URL("./fixtures/export", import.meta.url)
  .pathname;

/** The optional inputs of the fixture: a WorkOS export, a Mux map, overrides. */
export const FIXTURE_INPUTS = {
  muxMap: new URL("./fixtures/mux-map.json", import.meta.url).pathname,
  overrides: new URL("./fixtures/overlay-overrides.json", import.meta.url)
    .pathname,
  workosUsers: new URL("./fixtures/workos-users.csv", import.meta.url).pathname,
} as const;

export function fixtureExport(): Promise<ExportFiles> {
  return readExportDirectory(FIXTURE_DIR);
}

/** One JSONL line per row. */
export function jsonl(rows: readonly unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join("");
}

/**
 * Personal and secret values of the fixture and its optional inputs: none
 * may appear in a staging plan, and none in anything the importer prints
 * (B2, task 5 review I1). Tasks 7 and 8 add the values of the rows they
 * add.
 */
export const FIXTURE_SECRETS = [
  // Addresses (the export's and the WorkOS export's).
  "ada.fixture@example.test",
  "Ada.Fixture@Example.test",
  "bea.fixture@example.test",
  "factuur.fixture@example.test",
  // Names: the sponsor's contact and company, the invoice name, the WorkOS names.
  "Bea Fixture",
  "Fixture Bakkerij",
  "Fixture Bakkerij BV",
  "Adalinde",
  "Fixturova",
  // Free text: the overlay, its override, the list's name and description.
  "Bakkerij Fixture",
  "Bakkerij Overschreven",
  "Familie oefenen",
  "Thuis",
  // VAT, tokens, asset ids, the consent's IP address and user agent, the WorkOS id.
  "BE0403170701",
  "fixture-reedit-token-0001",
  "fixture-view-token-0001",
  "asset-fixture-original-0001",
  "asset-fixture-preview-0001",
  "asset-fixture-sponsored-0001",
  "192.0.2.10",
  "FixtureAgent",
  "user_01FIXTUREADA",
  // The sponsorship rows (task 8).
  ...SPONSORSHIP_SECRETS,
] as const;
