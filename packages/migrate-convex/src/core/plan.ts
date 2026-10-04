/**
 * `plan` (phase 8 ruling 6): read → validate → transform → report → emit.
 *
 * The CLI reads the files and hands their text over; everything here is
 * pure, so the same inputs and `--now` always give the same bytes. The
 * transforms (phase 8 tasks 7 and 8) each return their statements, reset
 * keys and report section; task 10 lists them in `TRANSFORMS`. Until then
 * a plan holds the report, the manifest and empty SQL files.
 */
import { sha256Hex } from "@smog/utils";
import {
  type EmitInput,
  emitPlan,
  type FileGroup,
  type InputHashes,
  type Manifest,
  mergeResetKeys,
  type ResetKeys,
  renderManifest,
} from "./emit";
import {
  type ConvexExport,
  type ExportFiles,
  validateExport,
} from "./export-schema";
import {
  type MuxMap,
  type OverlayOverrides,
  parseMuxMap,
  parseOverlayOverrides,
  parseWorkosUsers,
  type WorkosUser,
} from "./inputs";
import {
  buildReport,
  PlanBlocker,
  type Report,
  type ReportSection,
  renderReportJson,
  renderReportMarkdown,
  section,
} from "./report";
import type { Target } from "./target";

/** The parsed optional inputs a transform may use. */
export interface PlanInputs {
  readonly muxMap: MuxMap | null;
  readonly overrides: OverlayOverrides | null;
  readonly workosUsers: readonly WorkosUser[] | null;
}

export interface TransformContext {
  readonly data: ConvexExport;
  readonly inputs: PlanInputs;
  readonly now: Date;
  readonly target: Target;
}

export interface TransformResult {
  /** The migrated gestures, whose `gesture_fts` rows the last file rebuilds. */
  readonly ftsGestureIds?: readonly string[];
  readonly group: Exclude<FileGroup, "90-fts">;
  readonly resetKeys: ResetKeys;
  readonly sections: readonly ReportSection[];
  readonly statements: readonly string[];
}

export type Transform = (
  context: TransformContext
) => TransformResult | Promise<TransformResult>;

/** The transforms `plan` runs, in file order (task 10 wires tasks 7 and 8 in). */
export const TRANSFORMS: readonly Transform[] = [];

/** An input file's text (the CLI reads it). */
export type InputText = string | null | undefined;

export interface PlanRequest {
  readonly export: ExportFiles;
  readonly muxMap?: InputText;
  readonly now: Date;
  readonly overrides?: InputText;
  /** `--report-only`: the report alone, no SQL and no manifest. */
  readonly reportOnly?: boolean;
  readonly target: Target;
  /** Defaults to `TRANSFORMS`. */
  readonly transforms?: readonly Transform[];
  readonly workosUsers?: InputText;
}

export interface PlanOutput {
  /** Every file to write into the plan folder, by name, in a fixed order. */
  readonly files: ReadonlyMap<string, string>;
  readonly manifest: Manifest | null;
  readonly report: Report;
}

/**
 * The content hash of an export: the SHA-256 of `<table>\t<sha256 of its
 * documents.jsonl>` lines sorted by table. A ZIP and the same export
 * unpacked hash alike, and system tables never count.
 */
export async function hashExport(files: ExportFiles): Promise<string> {
  const names = Object.keys(files).sort();
  const lines = await Promise.all(
    names.map(async (name) => `${name}\t${await sha256Hex(files[name] ?? "")}`)
  );
  return sha256Hex(`${lines.join("\n")}\n`);
}

async function hashInput(text: InputText): Promise<string | null> {
  return typeof text === "string" ? await sha256Hex(text) : null;
}

const GROUP_ORDER: readonly Exclude<FileGroup, "90-fts">[] = [
  "10-users",
  "20-catalog",
  "30-learning",
  "40-account",
  "50-sponsorships",
];

function blockedResult(blocker: PlanBlocker): TransformResult {
  return {
    group: "10-users",
    resetKeys: {},
    sections: [section(blocker.domain, {}, [blocker.toIssue()])],
    statements: [],
  };
}

/** Runs a plan (see the module comment). An invalid input file throws `InputError`. */
export async function plan(request: PlanRequest): Promise<PlanOutput> {
  if (Number.isNaN(request.now.getTime())) {
    throw new Error("[migrate-convex] plan needs a valid --now");
  }
  const inputs: PlanInputs = {
    muxMap:
      typeof request.muxMap === "string" ? parseMuxMap(request.muxMap) : null,
    overrides:
      typeof request.overrides === "string"
        ? parseOverlayOverrides(request.overrides)
        : null,
    workosUsers:
      typeof request.workosUsers === "string"
        ? parseWorkosUsers(request.workosUsers)
        : null,
  };
  const hashes: InputHashes = {
    export: await hashExport(request.export),
    muxMap: await hashInput(request.muxMap),
    overrides: await hashInput(request.overrides),
    workosUsers: await hashInput(request.workosUsers),
  };
  const validated = validateExport(request.export);
  const context: TransformContext = {
    data: validated.data,
    inputs,
    now: request.now,
    target: request.target,
  };
  // Pure functions of the same context: their order in the list is the
  // order of their statements, whatever order they finish in.
  // A `PlanBlocker` (a row `insertRow` refuses, …) becomes a blocker and
  // leaves that transform's statements out; any other error fails the plan.
  const results = await Promise.all(
    (request.transforms ?? TRANSFORMS).map(async (transform) => {
      try {
        return await transform(context);
      } catch (error) {
        if (error instanceof PlanBlocker) {
          return blockedResult(error);
        }
        throw error;
      }
    })
  );
  const report = buildReport({
    export: {
      sha256: hashes.export,
      tables: validated.tables,
      unknownTables: validated.unknownTables,
    },
    now: request.now,
    sections: [
      ...validated.sections,
      ...results.flatMap((result) => result.sections),
    ],
    target: request.target,
  });
  const files = new Map<string, string>([
    ["report.json", renderReportJson(report)],
    ["report.md", renderReportMarkdown(report)],
  ]);
  if (request.reportOnly) {
    return { files, manifest: null, report };
  }
  const groups: Partial<Record<Exclude<FileGroup, "90-fts">, string[]>> = {};
  for (const group of GROUP_ORDER) {
    groups[group] = results
      .filter((result) => result.group === group)
      .flatMap((result) => result.statements);
  }
  const emitInput: EmitInput = {
    ftsGestureIds: results.flatMap((result) => result.ftsGestureIds ?? []),
    groups,
    inputs: hashes,
    now: request.now,
    report: { blockers: report.blockers, warnings: report.warnings },
    resetKeys: mergeResetKeys(results.map((result) => result.resetKeys)),
    target: request.target,
  };
  const emitted = await emitPlan(emitInput);
  for (const file of emitted.files) {
    files.set(file.name, file.content);
  }
  files.set("manifest.json", renderManifest(emitted.manifest));
  return { files, manifest: emitted.manifest, report };
}
