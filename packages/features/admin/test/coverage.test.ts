import { describe, expect, it } from "vitest";
import { ADMIN_SLICES, type AuditExempt } from "../src/contract";
import { AUDIT_DATA_SCHEMAS } from "../src/schema";
import { adminProcedurePaths } from "./helpers";

/*
 * The audit safety net (ruling 5). Every admin procedure is either a read
 * or a mutation, per slice, and every mutation is mapped to the audit
 * action it writes or exempt with a reason. A mapped mutation must be
 * checked by an `expectAudit("<path>", …)` call in some test, so no admin
 * write ships with an audit entry nobody verified. (A mutation listed as
 * a read is caught by the auth test: an admin read must change no table.)
 */

/** The test sources (raw), read at build time by Vite. */
const SOURCES = import.meta.glob<string>("./**/*.test.ts", {
  eager: true,
  import: "default",
  query: "?raw",
});

const EXPECT_AUDIT = /expectAudit\(\s*["'`]([\w.]+)["'`]/g;

/** Every procedure path the given sources pass to `expectAudit`. */
function assertedProcedures(sources: Record<string, string>): Set<string> {
  const found = new Set<string>();
  for (const [file, source] of Object.entries(sources)) {
    if (file.endsWith("coverage.test.ts")) {
      continue;
    }
    for (const match of source.matchAll(EXPECT_AUDIT)) {
      if (match[1]) {
        found.add(match[1]);
      }
    }
  }
  return found;
}

interface SliceMap {
  mutations: Record<string, string | AuditExempt>;
  reads: readonly string[];
}

/** Everything wrong with one slice's audit map; empty when it is complete. */
function coverageProblems(
  procedures: readonly string[],
  auditMap: SliceMap,
  asserted: ReadonlySet<string>
): string[] {
  const mutations = Object.entries(auditMap.mutations);
  const mutationPaths = mutations.map(([path]) => path);
  const classified = new Set([...mutationPaths, ...auditMap.reads]);
  const problems: string[] = [];
  for (const path of procedures) {
    if (!classified.has(path)) {
      problems.push(`${path}: neither a read nor a mutation`);
    }
  }
  for (const path of classified) {
    if (!procedures.includes(path)) {
      problems.push(`${path}: not a procedure of this slice`);
    }
  }
  for (const path of auditMap.reads) {
    if (mutationPaths.includes(path)) {
      problems.push(`${path}: both a read and a mutation`);
    }
  }
  for (const [path, entry] of mutations) {
    if (typeof entry !== "string") {
      if (entry.exempt.trim().length < 10) {
        problems.push(`${path}: exempt without a reason`);
      }
    } else if (!Object.hasOwn(AUDIT_DATA_SCHEMAS, entry)) {
      problems.push(`${path}: ${entry} has no data schema`);
    } else if (!asserted.has(path)) {
      problems.push(`${path}: no test checks its entry with expectAudit`);
    }
  }
  return problems;
}

describe("audit coverage", () => {
  const asserted = assertedProcedures(SOURCES);

  it("reads the test sources", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(1);
  });

  for (const [area, { auditMap, contract }] of Object.entries(ADMIN_SLICES)) {
    it(`${area}: every procedure is classified and every mapped mutation checked`, () => {
      expect(
        coverageProblems(adminProcedurePaths(contract), auditMap, asserted)
      ).toEqual([]);
    });
  }

  it("covers the whole admin contract with its slices", () => {
    const fromSlices = Object.values(ADMIN_SLICES)
      .flatMap(({ contract }) => adminProcedurePaths(contract))
      .sort();
    expect(fromSlices).toEqual(adminProcedurePaths());
  });

  describe("the check itself", () => {
    const procedures = ["things.create", "things.delete", "things.list"];

    it("fails on a procedure in neither list, and on stale or double entries", () => {
      expect(
        coverageProblems(
          procedures,
          {
            mutations: { "things.create": "legacy", "things.gone": "legacy" },
            reads: ["things.list", "things.create"],
          },
          new Set(["things.create"])
        )
      ).toEqual([
        "things.delete: neither a read nor a mutation",
        "things.gone: not a procedure of this slice",
        "things.create: both a read and a mutation",
        "things.gone: no test checks its entry with expectAudit",
      ]);
    });

    it("fails on a mapped mutation no test checks, and on a bare exemption", () => {
      expect(
        coverageProblems(
          procedures,
          {
            mutations: {
              "things.create": "legacy",
              "things.delete": { exempt: "" },
            },
            reads: ["things.list"],
          },
          assertedProcedures({
            "./other.test.ts": 'await expectAudit("things.update", {})',
          })
        )
      ).toEqual([
        "things.create: no test checks its entry with expectAudit",
        "things.delete: exempt without a reason",
      ]);
    });

    it("fails on an action without a data schema", () => {
      expect(
        coverageProblems(
          ["things.create"],
          { mutations: { "things.create": "gesture.nope" }, reads: [] },
          new Set(["things.create"])
        )
      ).toEqual(["things.create: gesture.nope has no data schema"]);
    });

    it("passes a complete map", () => {
      expect(
        coverageProblems(
          procedures,
          {
            mutations: {
              "things.create": "legacy",
              "things.delete": { exempt: "changes no stored state" },
            },
            reads: ["things.list"],
          },
          assertedProcedures({
            "./things.test.ts": 'await expectAudit(\n  "things.create", {})',
          })
        )
      ).toEqual([]);
    });
  });
});
