import { readFileSync } from "node:fs";
import type { ConvexExport, ExportFiles } from "../src/core/export-schema";
import { validateExport } from "../src/core/export-schema";
import { parseMuxMap, parseWorkosUsers } from "../src/core/inputs";
import type { PlanInputs, TransformContext } from "../src/core/plan";
import type { Target } from "../src/core/target";
import { FIXTURE_INPUTS, fixtureExport } from "./helpers";

/** `--now` of the transform tests. */
export const NOW = new Date("2026-10-04T12:00:00.000Z");

/** Convex ids of the fixture (phase 8 task 7). */
export const user = (suffix: string): string =>
  `jd7usr000000000000000000000${suffix}`;
export const cat = (suffix: string): string =>
  `kc7cat000000000000000000000${suffix}`;
export const ges = (suffix: string): string =>
  `kg7ges000000000000000000000${suffix}`;
export const lst = (suffix: string): string =>
  `kl7lst000000000000000000000${suffix}`;

export interface ContextOptions {
  /** Replace tables of the validated export. */
  readonly data?: Partial<ConvexExport>;
  /** Without the Mux map. */
  readonly noMuxMap?: boolean;
  /** Without the WorkOS export. */
  readonly noWorkos?: boolean;
  readonly target?: Target;
}

let cachedFiles: ExportFiles | null = null;

/** The fixture export as a transform context (WorkOS and Mux map by default). */
export async function fixtureContext(
  options: ContextOptions = {}
): Promise<TransformContext> {
  cachedFiles ??= await fixtureExport();
  const validated = validateExport(cachedFiles);
  const inputs: PlanInputs = {
    muxMap: options.noMuxMap
      ? null
      : parseMuxMap(readFileSync(FIXTURE_INPUTS.muxMap, "utf8")),
    overrides: null,
    workosUsers: options.noWorkos
      ? null
      : parseWorkosUsers(readFileSync(FIXTURE_INPUTS.workosUsers, "utf8")),
  };
  return {
    data: { ...validated.data, ...options.data },
    inputs,
    now: NOW,
    target: options.target ?? "production",
  };
}

const INSERT = /^INSERT INTO "[a-z_]+" \(/;
const CONFLICT_CLAUSE =
  / ON CONFLICT \(("[a-z_]+"(?:, "[a-z_]+")*)\) DO NOTHING/g;

const UPDATES_ROLE = /UPDATE\s+"?user"?\s+SET[^;]*"?role"?\s*=/i;
const ENDS_IN_CONFLICTS = /(?: ON CONFLICT \([^)]*\) DO NOTHING)+;$/;
const DO_UPDATE = /DO UPDATE/i;
/**
 * Every problem with the statements' conflict targets (ruling 7): each
 * insert ends in one or more named `ON CONFLICT (…) DO NOTHING` clauses
 * and nothing else, and no statement updates or upserts `role`.
 */
export function conflictProblems(statements: readonly string[]): string[] {
  const problems: string[] = [];
  for (const statement of statements) {
    if (UPDATES_ROLE.test(statement)) {
      problems.push(`updates role: ${statement}`);
    }
    if (!INSERT.test(statement)) {
      continue;
    }
    const tail = statement.slice(statement.lastIndexOf(") VALUES ("));
    const clauses = [...tail.matchAll(CONFLICT_CLAUSE)];
    if (clauses.length === 0) {
      problems.push(`no named conflict target: ${statement}`);
      continue;
    }
    if (!ENDS_IN_CONFLICTS.test(statement)) {
      problems.push(`does not end in its conflict clauses: ${statement}`);
    }
    for (const clause of clauses) {
      if ((clause[1] ?? "").includes('"role"')) {
        problems.push(`role in a conflict target: ${statement}`);
      }
    }
    if (DO_UPDATE.test(statement)) {
      problems.push(`upserts: ${statement}`);
    }
  }
  return problems;
}
