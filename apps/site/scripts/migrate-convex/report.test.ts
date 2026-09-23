// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ApplyResult } from "./apply";
import type { ImportPlan } from "./plan";
import { buildReport, reportableError, runFailed } from "./report";
import type { VerifyResult } from "./verify";

/* Synthetic throughout: written for this file, nothing from an export. */

const plan: ImportPlan = {
  categories: [
    {
      legacyId: "cat_rep_1",
      name: "Kleuren",
      isActive: true,
      createdAt: "2021-01-01T00:00:00.000Z",
    },
  ],
  gestures: [
    {
      legacyId: "ges_rep_1",
      name: "Rood",
      info: "",
      concepts: [],
      categoryLegacyIds: ["cat_rep_1"],
      playbackId: "pb_rep_1",
      isActive: true,
      createdAt: "2021-01-01T00:00:00.000Z",
    },
    {
      legacyId: "ges_rep_2",
      name: "Blauw | donker",
      info: "",
      concepts: [],
      categoryLegacyIds: ["cat_rep_1"],
      playbackId: "pb_rep_2",
      isActive: true,
      createdAt: "2021-01-01T00:00:00.000Z",
    },
  ],
  skipped: [
    {
      legacyId: "ges_rep_skip",
      name: "Zonder categorie",
      reason: "no-category",
    },
  ],
  dropped: { favourites: 5 },
  counts: {
    categories: 1,
    gestures: 3,
    user_favorites: 5,
    users: 0,
    sponsorships: 0,
    user_consents: 0,
    adminLogs: 0,
  },
};

const clean: ApplyResult = {
  categories: { created: 1, existing: 0, failed: [] },
  gestures: {
    created: 2,
    existing: 0,
    failed: [],
    skippedForFailedCategory: [],
  },
};

const passed: VerifyResult = {
  ok: true,
  incomplete: [],
  mismatches: [],
  differs: [],
  counts: {
    perCategory: [
      { legacyId: "cat_rep_1", name: "Kleuren", expected: 2, actual: 2 },
    ],
    activeCategories: { expected: 1, actual: 1 },
    activeGestures: { expected: 2, actual: 2 },
    userConsents: { before: 7, after: 7 },
  },
};

const input = (
  result: ApplyResult = clean,
  verification: VerifyResult = passed
) => ({
  target: "local" as const,
  database: "smog-staging (local emulation)",
  startedAt: new Date("2026-09-23T10:00:00.000Z"),
  withoutLegacyId: { categories: 0, gestures: 0 },
  plan,
  result,
  verification,
});

describe("buildReport", () => {
  it("states the target, the database and the outcome up front", () => {
    const report = buildReport(input());

    expect(report).toMatch(/Target:\*\* local/);
    expect(report).toMatch(/Database:\*\* smog-staging \(local emulation\)/);
    expect(report).toMatch(/Outcome:\*\* passed/);
  });

  it("gives source counts and planned/created/existing/failed per collection", () => {
    const report = buildReport(input());

    expect(report).toMatch(/\| user_favorites \| 5 \|/);
    expect(report).toMatch(/\| users \| 0 \|/);
    expect(report).toMatch(/\| categories \| 1 \| 1 \| 0 \| 0 \|/);
    expect(report).toMatch(/\| gestures \| 2 \| 2 \| 0 \| 0 \|/);
  });

  it("lists skipped gestures under Needs editorial action, with legacy id, name and reason", () => {
    const section =
      buildReport(input()).split("## Needs editorial action")[1] ?? "";

    expect(section).toMatch(
      /\| `ges_rep_skip` \| Zonder categorie \| no-category/
    );
  });

  it("states dropped favourites as a count and the spec's reason", () => {
    const report = buildReport(input());

    expect(report).toMatch(/5 favourites dropped/);
    expect(report).toMatch(/asked to be deleted/);
  });

  it("escapes a pipe in a name so it cannot break a table", () => {
    const report = buildReport(
      input(clean, {
        ...passed,
        ok: false,
        incomplete: [
          {
            collection: "gestures",
            id: 12,
            legacyId: "ges_rep_2",
            name: "Blauw | donker",
            check: "no categories",
            remedy: "delete and rerun",
          },
        ],
      })
    );

    expect(report).toContain("Blauw \\| donker");
  });

  it("lists incomplete documents under Incomplete — delete and rerun, and fails", () => {
    const failing: VerifyResult = {
      ...passed,
      ok: false,
      incomplete: [
        {
          collection: "gestures",
          id: 11,
          legacyId: "ges_rep_1",
          name: "Rood",
          check: "search entries: 0 (expected 1)",
          remedy: "re-save the gesture",
        },
        {
          collection: "gestures",
          id: 12,
          legacyId: "ges_rep_2",
          name: "Blauw",
          check: "no categories",
          remedy: "delete and rerun",
        },
      ],
    };
    const report = buildReport(input(clean, failing));

    expect(report).toMatch(/## Verification\s+\*\*Failed\.\*\*/);
    const section = report.split("### Incomplete — delete and rerun")[1] ?? "";
    expect(section).toMatch(
      /\| gestures \| 11 \| `ges_rep_1` \| Rood \| search entries: 0 \(expected 1\) \| re-save the gesture \|/
    );
    expect(section).toMatch(
      /\| gestures \| 12 \| `ges_rep_2` \| Blauw \| no categories \| delete and rerun \|/
    );
    expect(runFailed(clean, failing)).toBe(true);
  });

  it("shows differences on pre-existing documents without failing", () => {
    const edited: VerifyResult = {
      ...passed,
      differs: [
        {
          collection: "gestures",
          id: 11,
          legacyId: "ges_rep_1",
          name: "Rood",
          field: "name",
          detail: 'plan "Rood", target "Rood (bewerkt)"',
        },
      ],
    };
    const report = buildReport(input(clean, edited));

    expect(report).toMatch(/## Verification\s+\*\*Passed\.\*\*/);
    expect(report).toContain("### Differs from the export");
    expect(report).toContain("Rood (bewerkt)");
    expect(report).toMatch(
      /\| gestures \| 11 \| `ges_rep_1` \| Rood \| name \|/
    );
    expect(runFailed(clean, edited)).toBe(false);
  });

  it("never offers the search collection's Reindex as a remedy", () => {
    const report = buildReport(
      input(clean, {
        ...passed,
        ok: false,
        incomplete: [
          {
            collection: "gestures",
            id: 11,
            legacyId: "ges_rep_1",
            name: "Rood",
            check: "search entries: 0 (expected 1)",
            remedy: "re-save the gesture",
          },
        ],
      })
    );

    expect(report).not.toMatch(
      /re-save or reindex|or the search collection's Reindex/i
    );
    expect(report).toMatch(/Never use the search collection's Reindex button/);
  });

  it("states how many catalogue documents already in the target have no legacy id", () => {
    const report = buildReport({
      ...input(),
      withoutLegacyId: { categories: 2, gestures: 5 },
    });

    expect(report).toMatch(
      /without a legacy id \(not from this import\):\*\* 2 categories, 5 gestures/
    );
  });

  it("shows the user-consents count before and after, as information only", () => {
    expect(buildReport(input())).toMatch(
      /user-consents.*information only.*7.*7/
    );
  });

  it("still reports the import when verification did not complete, and fails", () => {
    const report = buildReport({
      ...input(),
      verification: undefined,
      verificationError: 'Failed query: select from "search"\nparams: 1',
    });

    expect(report).toMatch(/Outcome:\*\* FAILED/);
    expect(report).toMatch(/\| gestures \| 2 \| 2 \| 0 \| 0 \|/);
    expect(report).toMatch(/## Verification\s+\*\*Did not complete\.\*\*/);
    expect(report).toContain(
      'verification did not complete: Failed query: select from "search" params: 1'
    );
    expect(report).not.toContain("### Counts");
    expect(runFailed(clean, undefined)).toBe(true);
  });
});

describe("runFailed", () => {
  it("is false for a clean run with editorial skips only", () => {
    expect(runFailed(clean, passed)).toBe(false);
  });

  it("is true on any failed document, gesture skipped for a failed category, or mismatch", () => {
    expect(
      runFailed(
        {
          ...clean,
          categories: {
            ...clean.categories,
            failed: [{ legacyId: "cat_rep_1", error: "boom" }],
          },
        },
        passed
      )
    ).toBe(true);
    expect(
      runFailed(
        {
          ...clean,
          gestures: {
            ...clean.gestures,
            skippedForFailedCategory: ["ges_rep_1"],
          },
        },
        passed
      )
    ).toBe(true);
    expect(
      runFailed(clean, {
        ...passed,
        ok: false,
        mismatches: [{ subject: "counts", problem: "x" }],
      })
    ).toBe(true);
  });
});

/*
 * A failed create's error is the driver's, and its message echoes the
 * failing query's parameters. On this path those are catalogue values —
 * but the report must hold nothing from another table even if some future
 * hook made the failing query one on `users`, so the message is kept only
 * when every table it names belongs to the catalogue.
 */
describe("reportableError", () => {
  it("keeps a catalogue query's message, on one line", () => {
    expect(
      reportableError(
        'Failed query: insert into "gestures_rels" ("order") values (?)\nparams: 1'
      )
    ).toBe(
      'Failed query: insert into "gestures_rels" ("order") values (?) params: 1'
    );
  });

  it("redacts a message from a query on any other table", () => {
    for (const message of [
      'Failed query: insert into "users" ("email") values (?)\nparams: someone@example.test',
      'Failed query: select "id" from "gestures" left join "user_consents" on 1\nparams: x',
      "D1_ERROR: UNIQUE constraint failed: users.email: SQLITE_CONSTRAINT",
    ]) {
      const kept = reportableError(message);
      expect(kept).not.toContain("someone@example.test");
      expect(kept).not.toContain("params");
      expect(kept).toMatch(/redacted/);
    }
  });

  it("caps a long message", () => {
    expect(reportableError("x".repeat(5000)).length).toBeLessThan(1100);
  });
});
