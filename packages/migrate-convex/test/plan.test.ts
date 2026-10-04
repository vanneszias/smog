import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { category } from "@smog/db";
import { zipSync } from "fflate";
import { main } from "../src/cli/main";
import { insertRow } from "../src/core/emit";
import { legacyUuid } from "../src/core/ids";
import { hashExport, plan, type Transform } from "../src/core/plan";
import { section } from "../src/core/report";
import {
  FIXTURE_DIR,
  FIXTURE_INPUTS,
  FIXTURE_SECRETS,
  fixtureExport,
} from "./helpers";

const NOW = "2026-10-04T12:00:00.000Z";
const scratch = mkdtempSync(join(tmpdir(), "migrate-convex-plan-"));
afterAll(() => rmSync(scratch, { force: true, recursive: true }));

function capture() {
  const lines: string[] = [];
  return {
    lines,
    out: {
      error: (text: string) => lines.push(text),
      log: (text: string) => lines.push(text),
    },
  };
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((name) => [name, readFileSync(join(dir, name), "utf8")])
  );
}

function fixtureZipPath(): string {
  const path = join(scratch, "export.zip");
  const entries: Record<string, Uint8Array> = {};
  for (const name of readdirSync(FIXTURE_DIR, {
    encoding: "utf8",
    recursive: true,
  })) {
    const full = join(FIXTURE_DIR, name);
    if (statSync(full).isFile()) {
      entries[name] = new Uint8Array(readFileSync(full));
    }
  }
  writeFileSync(path, zipSync(entries));
  return path;
}

async function runPlan(
  args: string[]
): Promise<{ code: number; lines: string[] }> {
  const { lines, out } = capture();
  const code = await main(["plan", ...args], out);
  return { code, lines };
}

describe("plan on the minimal fixture", () => {
  test("writes the report and a manifest with nothing but empty SQL files", async () => {
    const out = join(scratch, "minimal");
    const { code, lines } = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "production",
      "--out",
      out,
      "--now",
      NOW,
    ]);
    expect(code).toBe(0);
    expect(lines).toEqual([
      `[migrate-convex] plan (production, now ${NOW}): 0 blocker(s), 0 warning(s); 10 file(s) written to ${out}.`,
    ]);
    const files = snapshot(out);
    expect(Object.keys(files)).toEqual([
      "10-users-001.sql",
      "20-catalog-001.sql",
      "30-learning-001.sql",
      "40-account-001.sql",
      "50-sponsorships-001.sql",
      "90-fts-001.sql",
      "manifest.json",
      "report.json",
      "report.md",
      "reset-imported-001.sql",
    ]);
    for (const [name, content] of Object.entries(files)) {
      if (name.endsWith(".sql")) {
        expect(content).toBe("");
      }
    }
    const manifest = JSON.parse(String(files["manifest.json"]));
    expect(manifest.target).toBe("production");
    expect(manifest.now).toBe(NOW);
    expect(manifest.inputs).toEqual({
      export: await hashExport(await fixtureExport()),
      muxMap: null,
      overrides: null,
      workosUsers: null,
    });
    expect(
      manifest.files.every(
        (file: { statements: number }) => file.statements === 0
      )
    ).toBe(true);
    const report = JSON.parse(String(files["report.json"]));
    expect(report.blockers).toBe(0);
    expect(report.export.tables).toEqual({
      adminLogs: 1,
      categories: 1,
      gesture_list_items: 1,
      gesture_lists: 1,
      gestures: 1,
      sponsorships: 1,
      user_consents: 1,
      user_favorites: 1,
      users: 1,
    });
  });

  test("is byte-identical across runs, and from the ZIP and the directory", async () => {
    const zip = fixtureZipPath();
    const dirs = ["a", "b", "zip"].map((name) => join(scratch, `same-${name}`));
    for (const [index, out] of dirs.entries()) {
      const source = index === 2 ? zip : FIXTURE_DIR;
      const args = [
        "--export",
        source,
        "--target",
        "staging",
        "--out",
        out,
        "--now",
        NOW,
      ];
      // biome-ignore lint/performance/noAwaitInLoops: three runs, one after another.
      const { code } = await runPlan(args);
      expect(code).toBe(0);
    }
    const [first, ...rest] = dirs.map(snapshot);
    for (const other of rest) {
      expect(other).toEqual(first ?? {});
    }
  });

  test("records the hashes of the optional inputs", async () => {
    const out = join(scratch, "inputs");
    const workos = join(scratch, "workos.csv");
    const muxMap = join(scratch, "mux-map.json");
    const overrides = join(scratch, "overlay-overrides.json");
    writeFileSync(
      workos,
      "id,email,first_name,last_name\nuser_01,ada.fixture@example.test,Ada,Fixture\n"
    );
    writeFileSync(
      muxMap,
      JSON.stringify({
        fixtureOriginalPlayback0001: { assetId: "asset-fixture-1" },
      })
    );
    writeFileSync(
      overrides,
      JSON.stringify({ ks7spn000000000000000000000spn1: "Bakkerij" })
    );
    const { code } = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "production",
      "--out",
      out,
      "--now",
      NOW,
      "--workos-users",
      workos,
      "--mux-map",
      muxMap,
      "--overrides",
      overrides,
    ]);
    expect(code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(out, "manifest.json"), "utf8")
    );
    const sha = (path: string) =>
      new Bun.CryptoHasher("sha256")
        .update(readFileSync(path, "utf8"))
        .digest("hex");
    expect(manifest.inputs.workosUsers).toBe(sha(workos));
    expect(manifest.inputs.muxMap).toBe(sha(muxMap));
    expect(manifest.inputs.overrides).toBe(sha(overrides));
  });

  test("a staging plan with every optional input, and the CLI's output, hold no fixture address, name, token or id", async () => {
    const out = join(scratch, "staging");
    const { code, lines } = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "staging",
      "--out",
      out,
      "--now",
      NOW,
      "--workos-users",
      FIXTURE_INPUTS.workosUsers,
      "--mux-map",
      FIXTURE_INPUTS.muxMap,
      "--overrides",
      FIXTURE_INPUTS.overrides,
    ]);
    expect(code).toBe(0);
    const text = [...Object.values(snapshot(out)), ...lines].join("\n");
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
    expect(
      JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).target
    ).toBe("staging");
  });

  test("--report-only writes the report alone, and stale plan files are replaced", async () => {
    const out = join(scratch, "report-only");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "10-users-007.sql"), "stale");
    writeFileSync(join(out, "notes.txt"), "the owner's");
    const { code } = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "staging",
      "--out",
      out,
      "--now",
      NOW,
      "--report-only",
    ]);
    expect(code).toBe(0);
    expect(readdirSync(out).sort()).toEqual([
      "notes.txt",
      "report.json",
      "report.md",
    ]);
  });

  test("a blocker exits 1 and still writes the report", async () => {
    const dir = join(scratch, "bad-export");
    mkdirSync(join(dir, "users"), { recursive: true });
    writeFileSync(
      join(dir, "users", "documents.jsonl"),
      '{"_id":"jd7x","_creationTime":1}\n'
    );
    const out = join(scratch, "bad-out");
    const { code, lines } = await runPlan([
      "--export",
      dir,
      "--target",
      "production",
      "--out",
      out,
      "--now",
      NOW,
    ]);
    expect(code).toBe(1);
    expect(lines[1]).toBe(
      "[migrate-convex] The plan has blockers (report.md lists them); apply refuses it."
    );
    const report = JSON.parse(readFileSync(join(out, "report.json"), "utf8"));
    expect(report.blockers).toBe(1);
    expect(
      JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).report
        .blockers
    ).toBe(1);
  });
});

describe("plan's arguments", () => {
  test("refuses a relative path (the CLI runs from packages/migrate-convex)", async () => {
    const { code, lines } = await runPlan([
      "--export",
      "export.zip",
      "--target",
      "staging",
      "--out",
      "/tmp/out",
    ]);
    expect(code).toBe(2);
    expect(lines[0]).toStartWith(
      "[migrate-convex] --export must be an absolute path: the command runs from packages/migrate-convex"
    );
    const out = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "staging",
      "--out",
      "out",
    ]);
    expect(out.lines[0]).toStartWith(
      "[migrate-convex] --out must be an absolute path"
    );
  });

  test("refuses a missing or unknown target, a bad --now and unknown options", async () => {
    const base = ["--export", FIXTURE_DIR, "--out", join(scratch, "x")];
    for (const [args, message] of [
      [base, "--target must be staging or production"],
      [[...base, "--target", "dev"], "--target must be staging or production"],
      [
        [...base, "--target", "staging", "--now", "soon"],
        "--now must be an ISO date-time",
      ],
      [
        [...base, "--target", "staging", "--dry-run"],
        "Unknown option: --dry-run",
      ],
      [
        [...base, "--target", "staging", "--target", "production"],
        "--target is given twice",
      ],
      [[...base, "--target"], "--target needs a value"],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one case after another.
      const result = await runPlan([...args]);
      expect(result.code).toBe(2);
      expect(result.lines[0]).toStartWith(`[migrate-convex] ${message}`);
    }
  });

  test("refuses an invalid input file, naming the key but not the value", async () => {
    const overrides = join(scratch, "too-long.json");
    writeFileSync(
      overrides,
      JSON.stringify({
        ks7spn1: "Een veel te lange sponsortekst voor de video",
      })
    );
    const { code, lines } = await runPlan([
      "--export",
      FIXTURE_DIR,
      "--target",
      "production",
      "--out",
      join(scratch, "y"),
      "--overrides",
      overrides,
      "--now",
      NOW,
    ]);
    expect(code).toBe(2);
    expect(lines[0]).toContain("ks7spn1");
    expect(lines[0]).not.toContain("sponsortekst");
  });
});

describe("plan's transform wiring (task 10 fills TRANSFORMS)", () => {
  test("puts each transform's statements in its group, its keys in the reset and its gestures in the FTS file", async () => {
    const catalog: Transform = async ({ data, target }) => {
      const rows = await Promise.all(
        data.categories.map(async (row) => ({
          id: await legacyUuid("category", row._id),
          legacyId: row._id,
          name: row.name,
          slug: "familie",
        }))
      );
      return {
        ftsGestureIds: ["g-1"],
        group: "20-catalog",
        resetKeys: { rows: { category: rows.map((row) => row.id) } },
        sections: [
          section("catalog", { categories: rows.length, [target]: 1 }),
        ],
        statements: rows.map((row) =>
          insertRow(
            category,
            {
              ...row,
              createdAt: new Date(0),
              sortOrder: 0,
              updatedAt: new Date(0),
            },
            [[category.legacyId]]
          )
        ),
      };
    };
    const result = await plan({
      export: await fixtureExport(),
      now: new Date(NOW),
      target: "staging",
      transforms: [catalog],
    });
    const id = await legacyUuid("category", "kc7cat000000000000000000000fam1");
    expect(result.files.get("20-catalog-001.sql")).toBe(
      `INSERT INTO "category" ("id", "slug", "name", "sort_order", "created_at", "updated_at", "legacy_id") VALUES ('${id}', 'familie', 'Familie', 0, 0, 0, 'kc7cat000000000000000000000fam1') ON CONFLICT ("legacy_id") DO NOTHING;\n`
    );
    expect(result.files.get("90-fts-001.sql")?.split("\n")).toHaveLength(3);
    expect(result.files.get("reset-imported-001.sql")).toBe(
      `DELETE FROM "category" WHERE "id" IN (SELECT value FROM json_each('["${id}"]'));\n`
    );
    expect(result.report.sections[2]?.counts).toEqual({
      categories: 1,
      staging: 1,
    });
    expect(result.manifest?.files[1]).toMatchObject({
      group: "20-catalog",
      statements: 1,
    });
    expect([...result.files.keys()]).toEqual([
      "report.json",
      "report.md",
      "10-users-001.sql",
      "20-catalog-001.sql",
      "30-learning-001.sql",
      "40-account-001.sql",
      "50-sponsorships-001.sql",
      "90-fts-001.sql",
      "reset-imported-001.sql",
      "manifest.json",
    ]);
  });

  test("turns a PlanBlocker into a blocker of its domain and leaves that transform out (I3)", async () => {
    const forgetful: Transform = () => ({
      group: "20-catalog",
      resetKeys: {},
      sections: [],
      statements: [
        // created_at and updated_at have only $defaultFns: refused.
        insertRow(
          category,
          { id: "c1", legacyId: "kc1", name: "A", slug: "a" },
          [[category.legacyId]]
        ),
      ],
    });
    const fine: Transform = () => ({
      group: "10-users",
      resetKeys: {},
      sections: [section("users", { users: 0 })],
      statements: [],
    });
    const result = await plan({
      export: await fixtureExport(),
      now: new Date(NOW),
      target: "production",
      transforms: [forgetful, fine],
    });
    expect(result.report.blockers).toBe(1);
    const catalog = result.report.sections.find(
      (part) => part.domain === "catalog"
    );
    expect(catalog?.issues).toEqual([
      {
        code: "missingColumn",
        ids: ["kc1", "c1"],
        message:
          "category.created_at is NOT NULL with no SQL default, and the row leaves it out.",
        severity: "blocker",
      },
    ]);
    expect(result.files.get("20-catalog-001.sql")).toBe("");
    expect(result.manifest?.report.blockers).toBe(1);
    // Any other error still fails the plan.
    await expect(
      plan({
        export: await fixtureExport(),
        now: new Date(NOW),
        target: "production",
        transforms: [
          () => {
            throw new Error("a bug");
          },
        ],
      })
    ).rejects.toThrow("a bug");
  });

  test("refuses an invalid --now", async () => {
    await expect(
      plan({ export: {}, now: new Date("x"), target: "staging" })
    ).rejects.toThrow("valid --now");
  });
});
