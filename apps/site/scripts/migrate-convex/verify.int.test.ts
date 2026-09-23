// @vitest-environment node
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "@payloadcms/db-d1-sqlite";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../../src/payload.config";
import { applyPlan } from "./apply";
import { runCli } from "./index";
import type { ImportPlan } from "./plan";
import { snapshotBeforeRun, type VerifyResult, verify } from "./verify";

/*
 * Synthetic, written for this file; nothing here comes from a Convex
 * export. Every legacy id carries this run's uuid, because the local D1 is
 * persisted and shared across runs (see apply.int.test.ts), and it is the
 * teardown's only handle.
 */
const RUN = crypto.randomUUID().slice(0, 8);
const TEARDOWN_BATCH = 50;
const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

const silent = (): void => {
  // applyPlan logs a line per document; the assertions read the results.
};

type PlanCategory = ImportPlan["categories"][number];
type PlanGesture = ImportPlan["gestures"][number];

function category(key: string): PlanCategory {
  return {
    legacyId: `t4_cat_${RUN}_${key}`,
    name: `Categorie ${key} ${RUN}`,
    isActive: true,
    createdAt: "2021-01-02T03:04:05.000Z",
  };
}

function gesture(
  key: string,
  categories: PlanCategory[],
  overrides: Partial<PlanGesture> = {}
): PlanGesture {
  return {
    legacyId: `t4_ges_${RUN}_${key}`,
    name: `Gebaar ${key} ${RUN}`,
    info: `Uitleg bij ${key}.`,
    concepts: [`begrip-${key}`, `synoniem-${key}`],
    categoryLegacyIds: categories.map((entry) => entry.legacyId),
    playbackId: `pb-${RUN}-${key}`,
    isActive: true,
    createdAt: "2023-05-06T07:08:09.000Z",
    ...overrides,
  };
}

function plan(categories: PlanCategory[], gestures: PlanGesture[]): ImportPlan {
  return {
    categories,
    gestures,
    skipped: [],
    dropped: { favourites: 0 },
    counts: {
      categories: categories.length,
      gestures: gestures.length,
      user_favorites: 0,
      users: 0,
      sponsorships: 0,
      user_consents: 0,
      adminLogs: 0,
    },
  };
}

const checksFor = (result: VerifyResult, legacyId: string): string[] =>
  result.incomplete
    .filter((entry) => entry.legacyId === legacyId)
    .map((entry) => entry.check);

describe("verify, against a real database", () => {
  let payload: Payload;

  const idOf = async (
    collection: "categories" | "gestures",
    legacyId: string
  ): Promise<number> => {
    const { docs } = await payload.find({
      collection,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { legacyId: { equals: legacyId } },
    });
    const id = docs[0]?.id;
    if (id === undefined) {
      throw new Error(`no ${collection} for ${legacyId}`);
    }
    return id;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    for (const collection of ["gestures", "categories"] as const) {
      for (;;) {
        const { docs } = await payload.find({
          collection,
          depth: 0,
          limit: TEARDOWN_BATCH,
          overrideAccess: true,
          where: { legacyId: { like: RUN } },
        });
        if (docs.length === 0) {
          break;
        }
        await payload.delete({
          collection,
          overrideAccess: true,
          where: { id: { in: docs.map((doc) => doc.id) } },
        });
      }
    }
  });

  describe("a clean import", () => {
    const colours = category("schoon-kleuren");
    const food = category("schoon-eten");
    const importPlan = plan(
      [colours, food],
      [
        gesture("schoon-rood", [colours]),
        gesture("schoon-oranje", [colours, food]),
        gesture("schoon-melk", [food], { concepts: [], isActive: false }),
      ]
    );

    let result: VerifyResult;

    beforeAll(async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      await applyPlan(payload, importPlan, { log: silent });
      result = await verify(payload, importPlan, before);
    });

    it("passes, with nothing incomplete, mismatched or different", () => {
      expect(result.incomplete).toEqual([]);
      expect(result.mismatches).toEqual([]);
      expect(result.differs).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it("counts gestures per category and active documents as planned (expected = actual)", () => {
      expect(result.counts.perCategory).toEqual([
        {
          legacyId: colours.legacyId,
          name: colours.name,
          expected: 2,
          actual: 2,
        },
        { legacyId: food.legacyId, name: food.name, expected: 2, actual: 2 },
      ]);
      expect(result.counts.activeGestures).toEqual({ expected: 2, actual: 2 });
      expect(result.counts.activeCategories).toEqual({
        expected: 2,
        actual: 2,
      });
    });

    it("sees the user-consents count unchanged", () => {
      expect(result.counts.userConsents.after).toBe(
        result.counts.userConsents.before
      );
    });

    it("reports a changed user-consents count as a mismatch", async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      const shifted = await verify(payload, importPlan, {
        ...before,
        userConsents: before.userConsents + 1,
      });

      expect(shifted.ok).toBe(false);
      expect(shifted.mismatches).toEqual([
        expect.objectContaining({ subject: "user-consents" }),
      ]);
    });
  });

  describe("a planned document that is not there", () => {
    const home = category("afwezig-thuis");
    const present = gesture("aanwezig", [home]);
    const absent = gesture("afwezig", [home]);
    const importPlan = plan([home], [present, absent]);

    let result: VerifyResult;

    beforeAll(async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      await applyPlan(payload, plan([home], [present]), { log: silent });
      result = await verify(payload, importPlan, before);
    });

    it("is a mismatch, and fails verification", () => {
      expect(result.ok).toBe(false);
      expect(result.mismatches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            legacyId: absent.legacyId,
            problem: expect.stringMatching(/missing/),
          }),
        ])
      );
    });
  });

  /*
   * Payload writes a document as separate statements with no transaction
   * (the row, its locales, its relationships, its hasMany texts, then the
   * search plugin's afterChange, which swallows its own errors). Each test
   * here leaves the state one of those statements not landing would leave,
   * by undoing it with raw SQL — and then runs `verify` as a *rerun* would,
   * with every document counted as pre-existing, since that is the case
   * where the importer would otherwise never look at it again.
   */
  describe("an incomplete write, seen by a later run", () => {
    const home = category("half-thuis");
    const away = category("half-weg");
    const noLinks = gesture("zonder-links", [home, away]);
    const noName = gesture("zonder-naam", [home]);
    const noSearch = gesture("zonder-zoek", [home]);
    const renamed = gesture("hernoemd", [home]);
    const relinked = gesture("herlinkt", [home, away]);
    const intact = gesture("heel", [home]);
    const importPlan = plan(
      [home, away],
      [noLinks, noName, noSearch, renamed, relinked, intact]
    );
    const editedName = `Hernoemd door een redacteur ${RUN}`;

    let rerun: VerifyResult;

    beforeAll(async () => {
      await applyPlan(payload, importPlan, { log: silent });

      const noLinksId = await idOf("gestures", noLinks.legacyId);
      await payload.db.drizzle.run(
        sql`DELETE FROM gestures_rels WHERE parent_id = ${noLinksId}`
      );
      const noNameId = await idOf("gestures", noName.legacyId);
      await payload.db.drizzle.run(
        sql`UPDATE gestures_locales SET name = '' WHERE _parent_id = ${noNameId} AND _locale = 'nl'`
      );
      await payload.delete({
        collection: "search",
        overrideAccess: true,
        where: {
          "doc.relationTo": { equals: "gestures" },
          "doc.value": { equals: await idOf("gestures", noSearch.legacyId) },
        },
      });

      // Two legal editorial changes, made through the local API the way the
      // admin makes them.
      await payload.update({
        collection: "gestures",
        id: await idOf("gestures", renamed.legacyId),
        locale: "nl",
        overrideAccess: true,
        data: { name: editedName },
      });
      await payload.update({
        collection: "gestures",
        id: await idOf("gestures", relinked.legacyId),
        overrideAccess: true,
        data: { categories: [await idOf("categories", away.legacyId)] },
      });

      const before = await snapshotBeforeRun(payload, importPlan);
      rerun = await verify(payload, importPlan, before);
    });

    it("lists a gesture whose category links are gone as incomplete", () => {
      expect(checksFor(rerun, noLinks.legacyId)).toEqual(["no categories"]);
    });

    it("lists a gesture whose Dutch name is empty as incomplete", () => {
      expect(checksFor(rerun, noName.legacyId)).toEqual(["empty nl name"]);
    });

    it("lists a gesture with no search entry as incomplete", () => {
      expect(checksFor(rerun, noSearch.legacyId)).toEqual([
        "search entries: 0 (expected 1)",
      ]);
    });

    it("names each incomplete gesture with its plan name, for the report", () => {
      expect(
        rerun.incomplete.find((entry) => entry.legacyId === noName.legacyId)
      ).toMatchObject({ collection: "gestures", name: noName.name });
    });

    it("fails verification", () => {
      expect(rerun.ok).toBe(false);
    });

    it("does not report an editor's rename or re-categorisation as incomplete or as a failure", () => {
      expect(checksFor(rerun, renamed.legacyId)).toEqual([]);
      expect(checksFor(rerun, relinked.legacyId)).toEqual([]);
      expect(checksFor(rerun, intact.legacyId)).toEqual([]);
      expect(
        rerun.mismatches.filter(
          (entry) =>
            entry.legacyId === renamed.legacyId ||
            entry.legacyId === relinked.legacyId
        )
      ).toEqual([]);
    });

    it("still shows those editorial changes, as differences from the export", () => {
      expect(rerun.differs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            legacyId: renamed.legacyId,
            field: "name",
          }),
          expect.objectContaining({
            legacyId: relinked.legacyId,
            field: "categories",
          }),
        ])
      );
    });

    it("does not fail on the category counts an editor's re-categorisation moved", () => {
      expect(
        rerun.mismatches.filter((entry) => entry.subject === "counts")
      ).toEqual([]);
    });
  });

  /*
   * The brief's case: a link removed right after the import. Seen by the
   * run that created the document, nobody else can have changed it, so any
   * difference from the plan is the import's own and fails.
   */
  describe("a link removed from a document this run created", () => {
    const home = category("link-thuis");
    const away = category("link-weg");
    const both = gesture("link-beide", [home, away]);
    const importPlan = plan([home, away], [both]);

    let result: VerifyResult;

    beforeAll(async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      await applyPlan(payload, importPlan, { log: silent });
      const bothId = await idOf("gestures", both.legacyId);
      const awayId = await idOf("categories", away.legacyId);
      await payload.db.drizzle.run(
        sql`DELETE FROM gestures_rels WHERE parent_id = ${bothId} AND categories_id = ${awayId}`
      );
      result = await verify(payload, importPlan, before);
    });

    it("is a mismatch on the gesture's categories and on the category count", () => {
      expect(result.ok).toBe(false);
      expect(result.incomplete).toEqual([]);
      expect(result.mismatches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            legacyId: both.legacyId,
            problem: expect.stringMatching(/categories/),
          }),
          expect.objectContaining({
            subject: "counts",
            problem: expect.stringContaining(away.legacyId),
          }),
        ])
      );
    });
  });

  describe("the CLI, end to end on the synthetic fixture", () => {
    let scratch: string;
    let exportDir: string;
    let reportPath: string;
    let code: number;
    let rerunCode: number;
    let report: string;
    let rerunReport: string;
    const lines: string[] = [];

    /*
     * `fixtures/valid` has fixed ids, which would collide with an earlier
     * run's rows in the persisted local D1, so this copies it outside the
     * work tree (where the CLI accepts it) and suffixes every id with RUN.
     */
    const copyFixtureWithRunIds = async (): Promise<void> => {
      await cp(path.join(FIXTURES, "valid"), exportDir, { recursive: true });
      for (const table of ["categories", "gestures"]) {
        const file = path.join(exportDir, table, "documents.jsonl");
        const text = await readFile(file, "utf8");
        await writeFile(
          file,
          text.replace(/"(cat|ges)_([a-z0-9_]+)"/g, `"$1_$2_t4${RUN}"`)
        );
      }
    };

    beforeAll(async () => {
      scratch = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-e2e-"));
      exportDir = path.join(scratch, "export");
      reportPath = path.join(scratch, "report.md");
      await copyFixtureWithRunIds();

      const argv = [
        "--export",
        exportDir,
        "--report",
        reportPath,
        "--target=local",
        "--apply",
      ];
      const io = {
        env: { CLOUDFLARE_ENV: "staging", NODE_ENV: "test" },
        log: (line: string) => lines.push(line),
        error: (line: string) => lines.push(line),
      };
      code = await runCli({ argv, ...io });
      report = await readFile(reportPath, "utf8");
      rerunCode = await runCli({ argv, ...io });
      rerunReport = await readFile(reportPath, "utf8");
    });

    afterAll(async () => {
      await rm(scratch, { recursive: true, force: true });
    });

    it("imports, verifies and exits 0", () => {
      expect(code).toBe(0);
      expect(report).toMatch(/## Verification\s+\*\*Passed\.\*\*/);
    });

    it("reports planned, created, existing and failed per collection", () => {
      expect(report).toMatch(/\| categories \| 2 \| 2 \| 0 \| 0 \|/);
      expect(report).toMatch(/\| gestures \| 2 \| 2 \| 0 \| 0 \|/);
    });

    it("lists the skipped gestures under Needs editorial action", () => {
      const section = report.split("## Needs editorial action")[1] ?? "";
      expect(section).toContain(`ges_no_category_t4${RUN}`);
      expect(section).toContain("no-category");
      expect(section).toContain("Testgebaar Onbekende Categorie");
    });

    it("states the dropped favourites as a count with the spec's reason", () => {
      expect(report).toMatch(/3 favourites dropped/);
      expect(report).toMatch(/asked to be deleted/);
    });

    it("converges on a rerun: everything existing, verification passes again", () => {
      expect(rerunCode).toBe(0);
      expect(rerunReport).toMatch(/\| gestures \| 2 \| 0 \| 2 \| 0 \|/);
      expect(rerunReport).toMatch(/## Verification\s+\*\*Passed\.\*\*/);
    });

    it("leaves nothing of the export or report inside the work tree", async () => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      expect(await readdir(here)).not.toContain("report.md");
    });
  });
});
