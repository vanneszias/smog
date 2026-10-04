/**
 * Reads a Convex snapshot export (phase 8 task 5): a directory, or the
 * ZIP the dashboard or `npx convex export` produces. Bun only.
 *
 * The export holds `<table>/documents.jsonl` per table, beside system
 * folders (`_storage/` with the file blobs, `_tables/`,
 * `_scheduled_functions/`, …). Every top-level name that starts with `_`
 * is skipped, and so is anything that is not a `documents.jsonl`
 * (`generated_schema.jsonl`, `README.md`). The ZIP is loaded whole into
 * memory and `fflate`'s `filter` skips the rest before it is inflated.
 *
 * The result is each table's text by table name (`ExportFiles`); the core
 * parses and validates it (`validateExport`).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import type { ExportFiles } from "../core/export-schema";

const DOCUMENTS = "documents.jsonl";
const decoder = new TextDecoder("utf-8", { fatal: true });

/** The table a path inside the export belongs to, or null when it is skipped. */
export function exportTableOf(path: string): string | null {
  const parts = path.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2 || parts[1] !== DOCUMENTS) {
    return null;
  }
  const [table] = parts;
  if (!table || table.startsWith("_")) {
    return null;
  }
  return table;
}

function sorted(files: Record<string, string>): ExportFiles {
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))
  );
}

function decode(path: string, bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new Error(`[migrate-convex] ${path} is not UTF-8`, { cause: error });
  }
}

/** The tables of an unpacked export directory. */
export async function readExportDirectory(dir: string): Promise<ExportFiles> {
  const tables = readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = `${entry.name}/${DOCUMENTS}`;
    const table = entry.isDirectory() ? exportTableOf(name) : null;
    return table ? [{ name, path: join(dir, name), table }] : [];
  });
  const read = await Promise.all(
    tables.map(async ({ name, path, table }) => {
      const file = Bun.file(path);
      return (await file.exists())
        ? ([[table, decode(name, await file.bytes())]] as const)
        : [];
    })
  );
  return sorted(Object.fromEntries(read.flat()));
}

/** The tables of an export ZIP's bytes (`_storage/` and other system folders are never inflated). */
export function readExportZipBytes(bytes: Uint8Array): ExportFiles {
  const entries = unzipSync(bytes, {
    filter: (file) => exportTableOf(file.name) !== null,
  });
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries(entries)) {
    const table = exportTableOf(name);
    if (table) {
      files[table] = decode(name, content);
    }
  }
  return sorted(files);
}

/** A directory or a ZIP file, told apart by the file system. */
export async function readExport(path: string): Promise<ExportFiles> {
  if (statSync(path).isDirectory()) {
    return readExportDirectory(path);
  }
  return readExportZipBytes(await Bun.file(path).bytes());
}
