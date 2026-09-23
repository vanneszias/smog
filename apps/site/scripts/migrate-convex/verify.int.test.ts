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
import { applyPlan, forbidConsentWrites } from "./apply";
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

    /*
     * Consent writes are refused while the importer runs (see
     * `forbidConsentWrites`), so the count is information for the report,
     * not a check that can fail.
     */
    it("reports a changed user-consents count as information, not a failure", async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      const shifted = await verify(payload, importPlan, {
        ...before,
        userConsents: before.userConsents + 1,
      });

      expect(shifted.ok).toBe(true);
      expect(shifted.mismatches).toEqual([]);
      expect(shifted.counts.userConsents).toEqual({
        before: before.userConsents + 1,
        after: before.userConsents,
      });
    });
  });

  describe("consent writes while the importer runs", () => {
    const home = category("toestemming-thuis");
    const importPlan = plan([home], [gesture("toestemming-gebaar", [home])]);

    let consentId: number;
    let createError: unknown;
    let updateError: unknown;
    let deleteError: unknown;
    let applied: Awaited<ReturnType<typeof applyPlan>>;
    let createdAfterRelease: number | undefined;

    beforeAll(async () => {
      const consent = await payload.create({
        collection: "user-consents",
        overrideAccess: true,
        data: { analyticsConsent: false, consentVersion: `t4-${RUN}` },
      });
      consentId = consent.id;

      const release = forbidConsentWrites(payload);
      try {
        createError = await payload
          .create({
            collection: "user-consents",
            overrideAccess: true,
            data: { analyticsConsent: true, consentVersion: `t4-${RUN}` },
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        updateError = await payload
          .update({
            collection: "user-consents",
            id: consentId,
            overrideAccess: true,
            data: { analyticsConsent: true },
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        deleteError = await payload
          .delete({
            collection: "user-consents",
            id: consentId,
            overrideAccess: true,
          })
          .then(
            () => undefined,
            (error: unknown) => error
          );
        applied = await applyPlan(payload, importPlan, { log: silent });
      } finally {
        release();
      }

      const after = await payload.create({
        collection: "user-consents",
        overrideAccess: true,
        data: { analyticsConsent: false, consentVersion: `t4-${RUN}` },
      });
      createdAfterRelease = after.id;
    });

    afterAll(async () => {
      await payload.delete({
        collection: "user-consents",
        overrideAccess: true,
        where: { consentVersion: { equals: `t4-${RUN}` } },
      });
    });

    it("refuses a consent create, update and delete", () => {
      for (const error of [createError, updateError, deleteError]) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(
          /\[migrate-convex\] the importer must not write consent records/
        );
      }
    });

    it("leaves the consent record as it was", async () => {
      const doc = await payload.findByID({
        collection: "user-consents",
        id: consentId,
        overrideAccess: true,
      });
      expect(doc.analyticsConsent).toBe(false);
    });

    it("does not get in the way of the import itself", () => {
      expect(applied.categories).toEqual({
        created: 1,
        existing: 0,
        failed: [],
      });
      expect(applied.gestures.created).toBe(1);
      expect(applied.gestures.failed).toEqual([]);
    });

    it("is lifted again when released", () => {
      expect(createdAfterRelease).toBeTypeOf("number");
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

    /*
     * A pre-existing gesture whose only fault is its search entry is
     * otherwise whole, and an editor may have worked on it since: saving it
     * (or reindexing) rebuilds the entry without losing that work.
     */
    it("says to re-save a pre-existing gesture whose only fault is its search entry", () => {
      const remedies = (legacyId: string): string[] =>
        rerun.incomplete
          .filter((entry) => entry.legacyId === legacyId)
          .map((entry) => entry.remedy);

      expect(remedies(noSearch.legacyId)).toEqual([
        "re-save or reindex the gesture",
      ]);
      expect(remedies(noLinks.legacyId)).toEqual(["delete and rerun"]);
      expect(remedies(noName.legacyId)).toEqual(["delete and rerun"]);
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

  describe("a gesture this run created without its search entry", () => {
    const home = category("nieuw-zoek-thuis");
    const fresh = gesture("nieuw-zonder-zoek", [home]);
    const importPlan = plan([home], [fresh]);

    let result: VerifyResult;

    beforeAll(async () => {
      const before = await snapshotBeforeRun(payload, importPlan);
      await applyPlan(payload, importPlan, { log: silent });
      await payload.delete({
        collection: "search",
        overrideAccess: true,
        where: {
          "doc.relationTo": { equals: "gestures" },
          "doc.value": { equals: await idOf("gestures", fresh.legacyId) },
        },
      });
      result = await verify(payload, importPlan, before);
    });

    it("is incomplete with delete and rerun, since the create itself stopped short", () => {
      expect(result.incomplete).toEqual([
        expect.objectContaining({
          legacyId: fresh.legacyId,
          check: "search entries: 0 (expected 1)",
          remedy: "delete and rerun",
        }),
      ]);
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
    const copyFixtureWithRunIds = async (
      destination: string,
      tag: string
    ): Promise<void> => {
      await cp(path.join(FIXTURES, "valid"), destination, { recursive: true });
      for (const table of ["categories", "gestures"]) {
        const file = path.join(destination, table, "documents.jsonl");
        const text = await readFile(file, "utf8");
        await writeFile(
          file,
          text.replace(/"(cat|ges)_([a-z0-9_]+)"/g, `"$1_$2_${tag}${RUN}"`)
        );
      }
    };

    beforeAll(async () => {
      scratch = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-e2e-"));
      exportDir = path.join(scratch, "export");
      reportPath = path.join(scratch, "report.md");
      await copyFixtureWithRunIds(exportDir, "t4");

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

    /*
     * `verify` failing after `applyPlan` wrote must still leave a record of
     * what was written. The fault: the search reads `verify` makes (and
     * `applyPlan` never does) throw.
     */
    it("still writes a report, marked incomplete, when verification throws after the import", async () => {
      const brokenExport = path.join(scratch, "export-broken-verify");
      const brokenReport = path.join(scratch, "report-broken-verify.md");
      await copyFixtureWithRunIds(brokenExport, "t4v");
      const real = await getPayload({ config });
      const failingVerify = new Proxy(real, {
        get(target, property) {
          if (property === "find") {
            return (args: Parameters<Payload["find"]>[0]) =>
              args.collection === "search"
                ? Promise.reject(new Error("injected: search read failed"))
                : target.find(args);
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      const brokenCode = await runCli({
        argv: [
          "--export",
          brokenExport,
          "--report",
          brokenReport,
          "--target=local",
          "--apply",
        ],
        env: { CLOUDFLARE_ENV: "staging", NODE_ENV: "test" },
        log: (line) => lines.push(line),
        error: (line) => lines.push(line),
        loadPayload: () => Promise.resolve(failingVerify),
      });
      const partial = await readFile(brokenReport, "utf8");

      expect(brokenCode).not.toBe(0);
      expect(partial).toMatch(/\| gestures \| 2 \| 2 \| 0 \| 0 \|/);
      expect(partial).toMatch(
        /verification did not complete: injected: search read failed/
      );
      expect(partial).toMatch(/Outcome:\*\* FAILED/);
    });

    /*
     * The CLI holds the consent refusal over the whole run: a consent write
     * attempted from inside the import (here, by the injected `create`,
     * standing in for some future hook) is refused, and the refusal is
     * lifted once the run ends.
     */
    it("refuses a consent write attempted during a CLI run, and lifts the refusal after", async () => {
      const consentExport = path.join(scratch, "export-consent");
      const consentReport = path.join(scratch, "report-consent.md");
      await copyFixtureWithRunIds(consentExport, "t4c");
      const real = await getPayload({ config });
      const consentData = {
        analyticsConsent: true,
        consentVersion: `t4c-${RUN}`,
      };
      let duringRun: unknown = "not attempted";
      const sneaky = new Proxy(real, {
        get(target, property) {
          if (property === "create") {
            return async (args: Parameters<Payload["create"]>[0]) => {
              if (duringRun === "not attempted") {
                duringRun = await target
                  .create({
                    collection: "user-consents",
                    overrideAccess: true,
                    data: consentData,
                  })
                  .then(
                    () => "written",
                    (caught: unknown) => caught
                  );
              }
              return target.create(args);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      try {
        const consentCode = await runCli({
          argv: [
            "--export",
            consentExport,
            "--report",
            consentReport,
            "--target=local",
            "--apply",
          ],
          env: { CLOUDFLARE_ENV: "staging", NODE_ENV: "test" },
          log: (line) => lines.push(line),
          error: (line) => lines.push(line),
          loadPayload: () => Promise.resolve(sneaky),
        });

        expect(consentCode).toBe(0);
        expect(duringRun).toBeInstanceOf(Error);
        expect((duringRun as Error).message).toMatch(
          /the importer must not write consent records/
        );
        const afterRun = await real.create({
          collection: "user-consents",
          overrideAccess: true,
          data: consentData,
        });
        expect(afterRun.id).toBeTypeOf("number");
      } finally {
        await real.delete({
          collection: "user-consents",
          overrideAccess: true,
          where: { consentVersion: { equals: `t4c-${RUN}` } },
        });
      }
    });

    it("leaves nothing of the export or report inside the work tree", async () => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      expect(await readdir(here)).not.toContain("report.md");
    });
  });
});
