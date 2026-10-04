import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import {
  exportTableOf,
  readExport,
  readExportDirectory,
  readExportZipBytes,
} from "../src/cli/read-export";
import { FIXTURE_DIR } from "./helpers";

const scratch = mkdtempSync(join(tmpdir(), "migrate-convex-read-"));
afterAll(() => rmSync(scratch, { force: true, recursive: true }));

function files(dir: string): string[] {
  return readdirSync(dir, { encoding: "utf8", recursive: true })
    .filter((path) => statSync(join(dir, path)).isFile())
    .sort();
}

/** The fixture directory as a ZIP, as the dashboard's export holds it. */
function fixtureZip(extra: Record<string, Uint8Array> = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const path of files(FIXTURE_DIR)) {
    entries[path] = new Uint8Array(readFileSync(join(FIXTURE_DIR, path)));
  }
  return zipSync({ ...entries, ...extra });
}

describe("the export readers", () => {
  test("take only <table>/documents.jsonl outside system folders", () => {
    expect(exportTableOf("users/documents.jsonl")).toBe("users");
    expect(exportTableOf("users/generated_schema.jsonl")).toBeNull();
    expect(exportTableOf("_storage/documents.jsonl")).toBeNull();
    expect(exportTableOf("_tables/documents.jsonl")).toBeNull();
    expect(exportTableOf("_storage/kz7sto")).toBeNull();
    expect(exportTableOf("README.md")).toBeNull();
    expect(exportTableOf("wrap/users/documents.jsonl")).toBeNull();
  });

  test("the directory reader returns the nine tables of the fixture", async () => {
    const tables = await readExportDirectory(FIXTURE_DIR);
    expect(Object.keys(tables)).toEqual([
      "adminLogs",
      "categories",
      "gesture_list_items",
      "gesture_lists",
      "gestures",
      "sponsorships",
      "user_consents",
      "user_favorites",
      "users",
    ]);
    expect(tables.users).toBe(
      readFileSync(join(FIXTURE_DIR, "users", "documents.jsonl"), "utf8")
    );
  });

  test("the ZIP and directory readers agree", async () => {
    const zipPath = join(scratch, "export.zip");
    await Bun.write(zipPath, fixtureZip());
    expect(await readExport(zipPath)).toEqual(await readExport(FIXTURE_DIR));
  });

  test("the ZIP reader never inflates _storage/ (a blob that is not UTF-8 is skipped)", () => {
    // A stored file that the reader would fail to decode if it read it.
    const blob = new Uint8Array([0xff, 0xfe, 0x00, 0xc3]);
    const zip = fixtureZip({
      "_storage/documents.jsonl": blob,
      "_storage/kz7blob": blob,
    });
    const tables = readExportZipBytes(zip);
    expect(Object.keys(tables)).not.toContain("_storage");
    expect(Object.keys(tables)).toHaveLength(9);
    // Without the filter the same blob as a table fails loudly.
    expect(() =>
      readExportZipBytes(zipSync({ "users/documents.jsonl": blob }))
    ).toThrow("users/documents.jsonl is not UTF-8");
  });

  test("an unknown table is passed on (the core lists and ignores it)", () => {
    const zip = zipSync({
      "sessions/documents.jsonl": new TextEncoder().encode("{}\n"),
    });
    expect(readExportZipBytes(zip)).toEqual({ sessions: "{}\n" });
  });

  test("a missing export fails with the reader's error", async () => {
    await expect(readExport(join(scratch, "missing.zip"))).rejects.toThrow(
      "ENOENT"
    );
  });
});
