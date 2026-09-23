// @vitest-environment node
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import config from "../../src/payload.config";
import { type ApplyResult, applyPlan } from "./apply";
import type { ImportPlan } from "./plan";

/*
 * Every legacy id here carries this run's uuid. The local D1 is persisted and
 * shared by every integration file a worker runs, so a fixed id would collide
 * with an earlier run's row on the UNIQUE `legacy_id` index — and an importer
 * that counts a collision as `existing` would then pass the first-run tests
 * against somebody else's leftovers. It is also the teardown's only handle.
 *
 * All of it is synthetic, written for this file. Nothing here comes from a
 * Convex export.
 */
const RUN = crypto.randomUUID().slice(0, 8);
/** Rows per teardown read and delete, under D1's cap of 100 bind parameters. */
const TEARDOWN_BATCH = 50;

const silent = (): void => {
  // applyPlan logs a line per document; the assertions read the result.
};

type PlanCategory = ImportPlan["categories"][number];
type PlanGesture = ImportPlan["gestures"][number];

function category(key: string, createdAt: string): PlanCategory {
  return {
    legacyId: `t3_cat_${RUN}_${key}`,
    name: `Categorie ${key} ${RUN}`,
    isActive: true,
    createdAt,
  };
}

function gesture(
  key: string,
  categories: PlanCategory[],
  overrides: Partial<PlanGesture> = {}
): PlanGesture {
  return {
    legacyId: `t3_ges_${RUN}_${key}`,
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

type CreateArgs = Parameters<Payload["create"]>[0];
type RealCreate = (args: CreateArgs) => Promise<unknown>;

/**
 * The fault injection: the real Payload with `create` swapped for `override`,
 * which receives the real `create` to call through to. Everything else is
 * the real instance, so the importer under test has no test-only branch —
 * it cannot tell this apart from `payload`.
 */
function withCreate(
  payload: Payload,
  override: (args: CreateArgs, real: RealCreate) => Promise<unknown>
): Payload {
  const real: RealCreate = (args) => payload.create(args);
  return new Proxy(payload, {
    get(target, property) {
      if (property === "create") {
        return (args: CreateArgs) => override(args, real);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function legacyIdOf(args: CreateArgs): unknown {
  return (args.data as { legacyId?: unknown }).legacyId;
}

type DbInsert = Payload["db"]["insert"];

/**
 * A finer fault: while `legacyId`'s create runs, the adapter's `insert`
 * into `tableName` throws. `@payloadcms/drizzle`'s `upsertRow` (3.89.0)
 * writes every child table through `adapter.insert`, so the create stops
 * exactly there with every earlier statement landed — what a create that
 * died part-way leaves on D1, which has no transactions.
 */
function withFailingInsert(
  payload: Payload,
  tableName: string,
  legacyId: string
): Payload {
  return withCreate(payload, async (args, real) => {
    if (legacyIdOf(args) !== legacyId) {
      return real(args);
    }
    const db = payload.db;
    const realInsert: DbInsert = db.insert;
    db.insert = ((insertArgs: Parameters<DbInsert>[0]) =>
      insertArgs.tableName === tableName
        ? Promise.reject(new Error(`injected: insert into ${tableName}`))
        : realInsert.call(db, insertArgs)) as DbInsert;
    try {
      return await real(args);
    } finally {
      db.insert = realInsert;
    }
  });
}

describe("applyPlan, against a real database", () => {
  let payload: Payload;

  const findByLegacyId = async <C extends "categories" | "gestures">(
    collection: C,
    legacyId: string
  ) => {
    const { docs } = await payload.find({
      collection,
      depth: 0,
      limit: 10,
      locale: "nl",
      overrideAccess: true,
      where: { legacyId: { equals: legacyId } },
    });
    return docs;
  };

  const categoryId = async (entry: PlanCategory): Promise<number> => {
    const [doc] = await findByLegacyId("categories", entry.legacyId);
    if (doc === undefined) {
      throw new Error(`no category for ${entry.legacyId}`);
    }
    return doc.id;
  };

  const gestureDoc = async (entry: PlanGesture) => {
    const [doc] = await findByLegacyId("gestures", entry.legacyId);
    if (doc === undefined) {
      throw new Error(`no gesture for ${entry.legacyId}`);
    }
    return doc;
  };

  /** Documents per legacy id, so a duplicate shows up as a 2. */
  const copies = async (
    collection: "categories" | "gestures",
    entries: Array<{ legacyId: string }>
  ): Promise<number[]> =>
    Promise.all(
      entries.map(
        async (entry) =>
          (await findByLegacyId(collection, entry.legacyId)).length
      )
    );

  const searchEntriesFor = async (gestureIds: number[]): Promise<number> =>
    (
      await payload.count({
        collection: "search",
        overrideAccess: true,
        where: {
          "doc.relationTo": { equals: "gestures" },
          "doc.value": { in: gestureIds },
        },
      })
    ).totalDocs;

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  /*
   * Gestures first: they hold the relationship to categories. Deleting a
   * gesture also removes its search entry (the plugin's afterDelete hook).
   * Paged because `payload.delete` binds one parameter per document into
   * its trailing `payload_preferences` delete, and D1 refuses at 100.
   */
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

  describe("a first run, then a rerun", () => {
    const colours = category("kleuren", "2021-01-02T03:04:05.000Z");
    const food = category("eten", "2021-02-03T04:05:06.000Z");
    const animals = category("dieren", "2021-03-04T05:06:07.000Z");
    const red = gesture("rood", [colours]);
    const orange = gesture("oranje", [colours, food], {
      createdAt: "2022-10-11T12:13:14.000Z",
    });
    const milk = gesture("melk", [food], { concepts: [], info: "" });
    const dog = gesture("hond", [animals]);
    const sweet = gesture("snoepje", [food], { isActive: false });
    const importPlan = plan(
      [colours, food, animals],
      [red, orange, milk, dog, sweet]
    );

    let first: ApplyResult;
    let second: ApplyResult;
    let consentsBefore: number;
    let consentsAfter: number;
    let gestureIds: number[];
    let editedUpdatedAt: string;
    let rerunCreateCalls = 0;
    const editedName = `Rood, door een redacteur hernoemd ${RUN}`;

    const countConsents = async (): Promise<number> =>
      (
        await payload.count({
          collection: "user-consents",
          overrideAccess: true,
        })
      ).totalDocs;

    beforeAll(async () => {
      consentsBefore = await countConsents();
      first = await applyPlan(payload, importPlan, { log: silent });
      consentsAfter = await countConsents();

      gestureIds = await Promise.all(
        importPlan.gestures.map(async (entry) => (await gestureDoc(entry)).id)
      );

      // An editor renames a gesture between the two runs.
      const edited = await payload.update({
        collection: "gestures",
        id: (await gestureDoc(red)).id,
        locale: "nl",
        overrideAccess: true,
        data: { name: editedName },
      });
      editedUpdatedAt = edited.updatedAt;

      const counting = withCreate(payload, (args, real) => {
        rerunCreateCalls += 1;
        return real(args);
      });
      second = await applyPlan(counting, importPlan, { log: silent });
    });

    it("creates every category and gesture on the first run", () => {
      expect(first).toEqual({
        categories: { created: 3, existing: 0, failed: [] },
        gestures: {
          created: 5,
          existing: 0,
          failed: [],
          skippedForFailedCategory: [],
        },
      });
    });

    it("creates nothing on the rerun and reports everything as existing", () => {
      expect(second).toEqual({
        categories: { created: 0, existing: 3, failed: [] },
        gestures: {
          created: 0,
          existing: 5,
          failed: [],
          skippedForFailedCategory: [],
        },
      });
    });

    /*
     * The unique index would turn a re-create into a conflict the importer
     * counts as `existing` anyway, so the counts above cannot tell whether
     * the rerun looked first. This can: a rerun that relied on the index
     * would attempt every create, run every beforeChange hook, and hang the
     * common path on the D1 error text that only a real race should need.
     */
    it("looks each document up first, so the rerun attempts no create at all", () => {
      expect(rerunCreateCalls).toBe(0);
    });

    it("leaves exactly one document per legacy id after both runs", async () => {
      expect(await copies("categories", importPlan.categories)).toEqual([
        1, 1, 1,
      ]);
      expect(await copies("gestures", importPlan.gestures)).toEqual([
        1, 1, 1, 1, 1,
      ]);
    });

    it("writes the Dutch content, with every category linked in source order", async () => {
      const doc = await gestureDoc(orange);

      expect(doc.name).toBe(orange.name);
      expect(doc.info).toBe(orange.info);
      expect(doc.concepts).toEqual(orange.concepts);
      expect(doc.playbackId).toBe(orange.playbackId);
      expect(doc.isActive).toBe(true);
      expect(doc.categories).toEqual([
        await categoryId(colours),
        await categoryId(food),
      ]);
    });

    it("writes the category's Dutch name and active flag", async () => {
      const [doc] = await findByLegacyId("categories", animals.legacyId);

      expect(doc?.name).toBe(animals.name);
      expect(doc?.isActive).toBe(true);
    });

    it("imports an inactive gesture as inactive", async () => {
      expect((await gestureDoc(sweet)).isActive).toBe(false);
    });

    /*
     * The rule is to preserve `createdAt` if Payload accepts it and to
     * record it if not. It does accept it: `@payloadcms/drizzle`'s
     * `upsertRow` (3.89.0) only stamps `createdAt` when the data has none.
     * Were that to change, this is the test that says so.
     */
    it("preserves the source createdAt on categories and gestures", async () => {
      const [cat] = await findByLegacyId("categories", food.legacyId);

      expect(cat?.createdAt).toBe(food.createdAt);
      expect((await gestureDoc(orange)).createdAt).toBe(orange.createdAt);
    });

    it("leaves a gesture an editor changed after the first run untouched", async () => {
      const doc = await gestureDoc(red);

      expect(doc.name).toBe(editedName);
      // Not merely the same name: no write happened at all.
      expect(doc.updatedAt).toBe(editedUpdatedAt);
    });

    it("never writes a user consent", () => {
      expect(consentsAfter).toBe(consentsBefore);
    });

    /*
     * The search plugin creates an index entry inside each gesture create
     * (its afterChange hook, one entry per create, no lookup first). So
     * idempotency of the index rides entirely on the importer never
     * re-creating a gesture: a rerun that did would add a second entry.
     */
    it("indexes each imported gesture exactly once, even after the rerun", async () => {
      expect(await searchEntriesFor(gestureIds)).toBe(gestureIds.length);
    });
  });

  describe("a category that fails to import", () => {
    const broken = category("kapot", "2021-04-05T06:07:08.000Z");
    const healthy = category("gezond", "2021-05-06T07:08:09.000Z");
    const onlyBroken = gesture("alleen-kapot", [broken]);
    const onlyHealthy = gesture("alleen-gezond", [healthy]);
    const both = gesture("beide", [healthy, broken]);
    const importPlan = plan([broken, healthy], [onlyBroken, onlyHealthy, both]);

    let faulted: ApplyResult;
    let resumed: ApplyResult;
    let copiesAfterFault: number[];

    beforeAll(async () => {
      const failingOnBroken = withCreate(payload, (args, real) => {
        if (legacyIdOf(args) === broken.legacyId) {
          return Promise.reject(new Error("injected: category create failed"));
        }
        return real(args);
      });

      faulted = await applyPlan(failingOnBroken, importPlan, { log: silent });
      copiesAfterFault = await copies("gestures", importPlan.gestures);
      resumed = await applyPlan(payload, importPlan, { log: silent });
    });

    it("records the failure and carries on with the next category", () => {
      expect(faulted.categories).toEqual({
        created: 1,
        existing: 0,
        failed: [
          {
            legacyId: broken.legacyId,
            error: "injected: category create failed",
          },
        ],
      });
    });

    it("skips every gesture that names the failed category, even alongside a healthy one", () => {
      expect(faulted.gestures).toEqual({
        created: 1,
        existing: 0,
        failed: [],
        skippedForFailedCategory: [onlyBroken.legacyId, both.legacyId],
      });
      expect(copiesAfterFault).toEqual([0, 1, 0]);
    });

    it("completes the skipped work on a rerun without the fault", () => {
      expect(resumed).toEqual({
        categories: { created: 1, existing: 1, failed: [] },
        gestures: {
          created: 2,
          existing: 1,
          failed: [],
          skippedForFailedCategory: [],
        },
      });
    });

    it("links the resumed gesture to all of its categories, in order", async () => {
      expect((await gestureDoc(both)).categories).toEqual([
        await categoryId(healthy),
        await categoryId(broken),
      ]);
    });

    it("leaves one document per legacy id across the faulted run and the rerun", async () => {
      expect(await copies("categories", importPlan.categories)).toEqual([1, 1]);
      expect(await copies("gestures", importPlan.gestures)).toEqual([1, 1, 1]);
    });
  });

  /*
   * A category create that died after its row but before its Dutch name
   * (`categories_locales`) leaves a row carrying the legacy id. Counted
   * `existing` and linked, its gestures would be created against it — and
   * deleting it, as verification says to, would cascade those links away while
   * the gestures stayed `existing`, one category short, for good. So a nameless
   * category is treated as failed.
   */
  describe("a category left without its Dutch name by an earlier run", () => {
    const nameless = category("naamloos", "2021-09-10T11:12:13.000Z");
    const named = category("benoemd", "2021-10-11T12:13:14.000Z");
    const both = gesture("naamloos-beide", [named, nameless]);
    const onlyNamed = gesture("alleen-benoemd", [named]);
    const importPlan = plan([nameless, named], [both, onlyNamed]);

    let faulted: ApplyResult;
    let rerun: ApplyResult;
    let copiesAfterRerun: number[];
    let afterDelete: ApplyResult;

    beforeAll(async () => {
      faulted = await applyPlan(
        withFailingInsert(payload, "categories_locales", nameless.legacyId),
        importPlan,
        { log: silent }
      );
      rerun = await applyPlan(payload, importPlan, { log: silent });
      copiesAfterRerun = await copies("gestures", importPlan.gestures);

      // The remedy, followed: delete the half-written category, rerun.
      await payload.delete({
        collection: "categories",
        id: await categoryId(nameless),
        overrideAccess: true,
      });
      afterDelete = await applyPlan(payload, importPlan, { log: silent });
    });

    it("left the category's row without its name on the faulted run", () => {
      expect(faulted.categories.failed.map((entry) => entry.legacyId)).toEqual([
        nameless.legacyId,
      ]);
    });

    it("counts the nameless category as failed on the rerun, not existing", () => {
      expect(rerun.categories.existing).toBe(1);
      expect(rerun.categories.failed.map((entry) => entry.legacyId)).toEqual([
        nameless.legacyId,
      ]);
      expect(rerun.categories.failed[0]?.error).toMatch(/no Dutch name/);
    });

    it("skips the gestures that need it, so the run fails", () => {
      expect(rerun.gestures.skippedForFailedCategory).toEqual([both.legacyId]);
      expect(copiesAfterRerun).toEqual([0, 1]);
    });

    it("creates the gesture whole, with both categories, after delete and rerun", async () => {
      expect(afterDelete.categories.failed).toEqual([]);
      expect(afterDelete.gestures.skippedForFailedCategory).toEqual([]);
      expect(afterDelete.gestures.created).toBe(1);
      expect((await gestureDoc(both)).categories).toEqual([
        await categoryId(named),
        await categoryId(nameless),
      ]);
    });
  });

  /*
   * A second writer inserts the row between this run's lookup and its
   * create. The injected `create` plays that writer: it lets the real
   * create through once (the other run winning), then makes the importer's
   * own create, which now hits the UNIQUE index.
   */
  describe("a create that loses a race on the unique index", () => {
    const contested = category("betwist", "2021-06-07T08:09:10.000Z");
    const contestedGesture = gesture("betwist-gebaar", [contested]);
    const importPlan = plan([contested], [contestedGesture]);

    let result: ApplyResult;

    beforeAll(async () => {
      const racing = withCreate(payload, async (args, real) => {
        await real(args);
        return real(args);
      });
      result = await applyPlan(racing, importPlan, { log: silent });
    });

    it("re-reads the winner and counts it as existing, not failed", () => {
      expect(result).toEqual({
        categories: { created: 0, existing: 1, failed: [] },
        gestures: {
          created: 0,
          existing: 1,
          failed: [],
          skippedForFailedCategory: [],
        },
      });
    });

    it("links gestures to the category the other writer created", async () => {
      expect((await gestureDoc(contestedGesture)).categories).toEqual([
        await categoryId(contested),
      ]);
    });

    it("leaves one document per legacy id and one search entry", async () => {
      expect(await copies("categories", [contested])).toEqual([1]);
      expect(await copies("gestures", [contestedGesture])).toEqual([1]);
      expect(
        await searchEntriesFor([(await gestureDoc(contestedGesture)).id])
      ).toBe(1);
    });
  });

  describe("two runs at once", () => {
    const shared = category("gedeeld", "2021-07-08T09:10:11.000Z");
    const gestures = ["een", "twee", "drie", "vier"].map((key) =>
      gesture(`tegelijk-${key}`, [shared])
    );
    const importPlan = plan([shared], gestures);

    let results: ApplyResult[];

    beforeAll(async () => {
      results = await Promise.all([
        applyPlan(payload, importPlan, { log: silent }),
        applyPlan(payload, importPlan, { log: silent }),
      ]);
    });

    it("between them create each document once and fail nothing", () => {
      const sum = (pick: (result: ApplyResult) => number): number =>
        results.reduce((total, result) => total + pick(result), 0);

      expect(sum((result) => result.categories.created)).toBe(1);
      expect(sum((result) => result.categories.existing)).toBe(1);
      expect(sum((result) => result.gestures.created)).toBe(gestures.length);
      expect(sum((result) => result.gestures.existing)).toBe(gestures.length);
      for (const result of results) {
        expect(result.categories.failed).toEqual([]);
        expect(result.gestures.failed).toEqual([]);
        expect(result.gestures.skippedForFailedCategory).toEqual([]);
      }
    });

    it("leave one document per legacy id", async () => {
      expect(await copies("categories", [shared])).toEqual([1]);
      expect(await copies("gestures", gestures)).toEqual([1, 1, 1, 1]);
    });
  });

  describe("a gesture that fails to import", () => {
    const home = category("thuis", "2021-08-09T10:11:12.000Z");
    const refused = gesture("geweigerd", [home]);
    const halfWritten = gesture("half", [home]);
    const fine = gesture("goed", [home]);
    const importPlan = plan([home], [refused, halfWritten, fine]);

    let result: ApplyResult;
    const lines: string[] = [];

    beforeAll(async () => {
      const faulty = withCreate(payload, async (args, real) => {
        const legacyId = legacyIdOf(args);
        if (legacyId === refused.legacyId) {
          throw new Error("injected: gesture refused");
        }
        if (legacyId === halfWritten.legacyId) {
          // No transactions: the row can land and the call still throw.
          await real(args);
          throw new Error("injected: failed after the insert");
        }
        return real(args);
      });
      result = await applyPlan(faulty, importPlan, {
        log: (line) => lines.push(line),
      });
    });

    it("records each failure and still creates the gesture after them", () => {
      expect(result.gestures.created).toBe(1);
      expect(result.gestures.existing).toBe(0);
      expect(result.gestures.failed.map((entry) => entry.legacyId)).toEqual([
        refused.legacyId,
        halfWritten.legacyId,
      ]);
      expect(result.gestures.failed[0]?.error).toBe(
        "injected: gesture refused"
      );
    });

    /*
     * A rerun would count that row as `existing` and never touch it again,
     * so the failure has to say it is there — otherwise a half-written
     * document is silently kept for good.
     */
    it("names a document the failed create left behind", async () => {
      const leftover = await gestureDoc(halfWritten);

      expect(result.gestures.failed[1]?.error).toContain(
        "injected: failed after the insert"
      );
      expect(result.gestures.failed[1]?.error).toContain(
        `document ${leftover.id}`
      );
    });

    it("logs each failure by legacy id", () => {
      expect(lines.some((line) => line.includes(refused.legacyId))).toBe(true);
      expect(lines.some((line) => line.includes(halfWritten.legacyId))).toBe(
        true
      );
    });
  });
});
