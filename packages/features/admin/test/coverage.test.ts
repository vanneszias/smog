import { describe, expect, it } from "vitest";
import {
  ADMIN_PROCEDURE_KINDS,
  ADMIN_SLICES,
  type AdminProcedureKind,
  type AdminProcedures,
} from "../src/contract";
import type { dashboardSlice } from "../src/contract/dashboard";
import { isWritableAuditAction } from "../src/schema";
import { adminProcedurePaths } from "./helpers";

/*
 * The audit classification (ruling 5). Each slice's `ADMIN_PROCEDURES` is
 * an exhaustive `Record` of its paths, so `check-types` already fails on an
 * unclassified or stale path; this is the runtime backstop, plus the rules
 * the type cannot state. `adminProcedure`'s guard enforces the kinds on
 * every call (`guard.test.ts`), and the auth test calls every procedure.
 */

/** Everything wrong with one kind; empty when it is valid. */
function kindProblems(path: string, kind: AdminProcedureKind | undefined) {
  if (kind === undefined) {
    return [`${path}: no procedure kind`];
  }
  if (kind === "read") {
    return [];
  }
  if ("audit" in kind) {
    return isWritableAuditAction(kind.audit)
      ? []
      : [`${path}: ${kind.audit} is not writable`];
  }
  return kind.exempt.trim().length >= 10
    ? []
    : [`${path}: exempt without a reason`];
}

describe("admin procedure kinds", () => {
  for (const [area, { contract, procedures }] of Object.entries(ADMIN_SLICES)) {
    it(`${area}: every procedure has a valid kind, and no kind is stale`, () => {
      const paths = adminProcedurePaths(contract);
      const kinds = procedures as Readonly<Record<string, AdminProcedureKind>>;
      expect(paths.flatMap((path) => kindProblems(path, kinds[path]))).toEqual(
        []
      );
      expect(
        Object.keys(kinds).filter((path) => !paths.includes(path))
      ).toEqual([]);
    });
  }

  it("the slices make up the whole admin contract, and the kinds cover it", () => {
    const fromSlices = Object.values(ADMIN_SLICES)
      .flatMap(({ contract }) => adminProcedurePaths(contract))
      .sort();
    expect(fromSlices).toEqual(adminProcedurePaths());
    expect(Object.keys(ADMIN_PROCEDURE_KINDS).sort()).toEqual(fromSlices);
  });

  it("rejects legacy, unknown actions and bare exemptions", () => {
    expect(kindProblems("things.import", { audit: "legacy" as never })).toEqual(
      ["things.import: legacy is not writable"]
    );
    expect(
      kindProblems("things.create", { audit: "gesture.nope" as never })
    ).toEqual(["things.create: gesture.nope is not writable"]);
    expect(kindProblems("things.upload", { exempt: " " })).toEqual([
      "things.upload: exempt without a reason",
    ]);
    expect(kindProblems("things.gone", undefined)).toEqual([
      "things.gone: no procedure kind",
    ]);
    expect(kindProblems("things.list", "read")).toEqual([]);
  });
});

describe("the kinds type", () => {
  it("rejects a slice map with a missing or a stale path (check-types)", () => {
    // @ts-expect-error: `dashboard` has no kind.
    const missing = {} as const satisfies AdminProcedures<
      typeof dashboardSlice
    >;
    const stale = {
      dashboard: "read",
      // @ts-expect-error: `stale` is not a procedure of the slice.
      stale: "read",
    } as const satisfies AdminProcedures<typeof dashboardSlice>;
    const legacy = {
      // @ts-expect-error: `legacy` is not a writable action.
      dashboard: { audit: "legacy" },
    } as const satisfies AdminProcedures<typeof dashboardSlice>;
    expect([missing, stale, legacy]).toHaveLength(3);
  });
});
