import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGrantStatements } from "@smog/config/admin-grant";
import { type CommandContext, main } from "../src/cli/main";
import { legacyUuid } from "../src/core/ids";
import {
  type D1Query,
  preflightFactsSchema,
  runPreflight,
} from "../src/core/preflight";
import { FIXTURE_DIR, FIXTURE_INPUTS, FIXTURE_SECRETS } from "./helpers";
import {
  migratedDatabase,
  type SqliteWrangler,
  sqliteWrangler,
} from "./sqlite-wrangler";

/*
 * `apply` (phase 8 ruling 14) on Bun, with the shared wrangler fake over
 * a real SQLite database that has every D1 migration: the flags, the
 * target guard (B2), the manifest hashes, each preflight refusal, the
 * dry run, the commands per env, and whole applies with re-runs, resets
 * and the native catalogue.
 */

const NOW = "2026-10-04T12:00:00.000Z";
const MAINTENANCE_ON = JSON.stringify({ bypassVersion: 1, enabled: true });
const ADA = "jd7usr000000000000000000000ada1";
const PRE_EXISTING = "preexisting.admin@example.test";
const PRE_LEGACY = "jd7usr000000000000000000000pre1";

const NOTHING_WRITTEN =
  /apply refused: \d+ preflight problem\(s\)\. Nothing was written\.$/;

const scratch = mkdtempSync(join(tmpdir(), "migrate-convex-apply-"));
afterAll(() => rmSync(scratch, { force: true, recursive: true }));

const plans: Record<"production" | "staging", string> = {
  production: join(scratch, "plan-production"),
  staging: join(scratch, "plan-staging"),
};

function capture() {
  const lines: { error: string[]; log: string[] } = { error: [], log: [] };
  return {
    lines,
    out: {
      error: (text: string) => lines.error.push(text),
      log: (text: string) => lines.log.push(text),
    },
  };
}

beforeAll(async () => {
  for (const target of ["production", "staging"] as const) {
    const { out } = capture();
    // biome-ignore lint/performance/noAwaitInLoops: two plans, one after the other.
    const code = await main(
      [
        "plan",
        "--export",
        FIXTURE_DIR,
        "--target",
        target,
        "--out",
        plans[target],
        "--now",
        NOW,
        "--workos-users",
        FIXTURE_INPUTS.workosUsers,
        "--mux-map",
        FIXTURE_INPUTS.muxMap,
        "--overrides",
        FIXTURE_INPUTS.overrides,
      ],
      out
    );
    expect(code).toBe(0);
  }
});

let copies = 0;
/** A copy of a plan folder a test may change. */
function planCopy(target: "production" | "staging"): string {
  copies += 1;
  const dir = join(scratch, `copy-${copies}`);
  cpSync(plans[target], dir, { recursive: true });
  return dir;
}

function context(wrangler: SqliteWrangler): CommandContext {
  return {
    env: {},
    fetch: () => Promise.reject(new Error("no network in this test")),
    newVersion: () => "catalog-version-test",
    runWrangler: wrangler.run,
    timer: { now: () => 0, sleep: () => Promise.resolve() },
  };
}

async function apply(
  wrangler: SqliteWrangler,
  args: readonly string[]
): Promise<{ code: number; lines: { error: string[]; log: string[] } }> {
  const { lines, out } = capture();
  const code = await main(["apply", ...args], out, context(wrangler));
  return { code, lines };
}

function count(wrangler: SqliteWrangler, sql: string): number {
  return (wrangler.db.query(sql).get() as { n: number }).n;
}

function counts(wrangler: SqliteWrangler): Record<string, number> {
  return Object.fromEntries(
    [
      "user",
      "category",
      "gesture",
      "gesture_fts",
      "favorite",
      "list",
      "list_item",
      "list_share",
      "consent_event",
      "audit_log",
      "sponsor",
      "invoice_request",
      "payment",
      "payment_item",
      "sponsorship",
      "sponsorship_event",
      "sponsorship_token",
    ].map((table) => [
      table,
      count(wrangler, `SELECT count(*) AS n FROM "${table}"`),
    ])
  );
}

function record(dir: string) {
  return JSON.parse(readFileSync(join(dir, "apply-report.json"), "utf8"));
}

describe("apply's flags", () => {
  test("production needs --yes, and refuses --reset; --native-catalog needs --reset", async () => {
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    for (const [args, message] of [
      [
        ["--env", "production", "--out", plans.production],
        "apply --env production needs --yes (try --dry-run first).",
      ],
      [
        ["--env", "production", "--out", plans.production, "--yes", "--reset"],
        "--reset is refused on production: the import there runs once (ruling 14).",
      ],
      [
        ["--env", "staging", "--out", plans.staging, "--native-catalog"],
        "--native-catalog needs --reset.",
      ],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one case after another.
      const result = await apply(wrangler, args);
      expect(result.code).toBe(1);
      expect(result.lines.error).toEqual([
        `[migrate-convex] apply refused: ${message}`,
      ]);
    }
    expect(wrangler.calls).toEqual([]);
  });

  test("refuses a missing or unknown env and a relative --out (exit 2)", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    for (const args of [
      ["--out", plans.staging],
      ["--env", "preview", "--out", plans.staging],
      ["--env", "dev", "--out", "out"],
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one case after another.
      expect((await apply(wrangler, args)).code).toBe(2);
    }
  });
});

describe("apply's target guard (B2)", () => {
  test("staging refuses a production plan, and production a staging plan", async () => {
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    const staging = await apply(wrangler, [
      "--env",
      "staging",
      "--out",
      plans.production,
    ]);
    expect(staging.code).toBe(1);
    expect(staging.lines.error[0]).toStartWith(
      `[migrate-convex] apply refused: The plan in ${plans.production} was made for production; apply --env staging refuses it`
    );
    const production = await apply(wrangler, [
      "--env",
      "production",
      "--out",
      plans.staging,
      "--yes",
    ]);
    expect(production.code).toBe(1);
    expect(production.lines.error[0]).toContain(
      "was made for staging; apply --env production refuses it"
    );
    expect(wrangler.calls).toEqual([]);
  });

  test("dev takes either target", async () => {
    for (const target of ["production", "staging"] as const) {
      const wrangler = sqliteWrangler(migratedDatabase());
      // biome-ignore lint/performance/noAwaitInLoops: one target after the other.
      const result = await apply(wrangler, [
        "--env",
        "dev",
        "--out",
        plans[target],
        "--dry-run",
      ]);
      expect(result.code).toBe(0);
    }
  });

  test("a manifest whose target was edited to staging is refused before the preflight (I-2)", async () => {
    const dir = planCopy("production");
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, target: "staging" }, null, 2)
    );
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    const result = await apply(wrangler, ["--env", "staging", "--out", dir]);
    expect(result.code).toBe(1);
    expect(result.lines.error).toEqual([
      "[migrate-convex] apply refused: manifest.json does not match the plan that made it (its target or blocker count was changed). Plan again; never edit a plan file.",
    ]);
    expect(wrangler.calls).toEqual([]);
  });

  test("the preflight still refuses production addresses on staging (the second guard)", async () => {
    const db = migratedDatabase();
    const query: D1Query = (sql) =>
      Promise.resolve(db.query(sql).all() as Record<string, unknown>[]);
    const facts = preflightFactsSchema.parse(
      JSON.parse(readFileSync(join(plans.production, "preflight.json"), "utf8"))
    );
    const result = await runPreflight(query, {
      env: "staging",
      facts,
      maintenance: MAINTENANCE_ON,
      nativeCatalog: false,
      target: "staging",
    });
    expect(result.refusals.map((refusal) => refusal.code)).toEqual([
      "unsanitisedOnStaging",
    ]);
  });
});

describe("apply's manifest", () => {
  test("refuses a changed, a missing or an unlisted-looking plan folder", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    const changed = planCopy("staging");
    writeFileSync(
      join(changed, "20-catalog-001.sql"),
      `${readFileSync(join(changed, "20-catalog-001.sql"), "utf8")}DELETE FROM "user";\n`
    );
    const result = await apply(wrangler, ["--env", "dev", "--out", changed]);
    expect(result.code).toBe(1);
    expect(result.lines.error).toEqual([
      "[migrate-convex] apply refused: The plan folder does not match its manifest: 20-catalog-001.sql. Plan again; never edit a plan file.",
    ]);

    const missing = planCopy("staging");
    rmSync(join(missing, "preflight.json"));
    expect(
      (await apply(wrangler, ["--env", "dev", "--out", missing])).lines.error[0]
    ).toContain("preflight.json (missing)");

    const none = join(scratch, "no-plan");
    const empty = await apply(wrangler, ["--env", "dev", "--out", none]);
    expect(empty.lines.error[0]).toContain("manifest.json does not exist");
    expect(wrangler.calls).toEqual([]);
  });

  test("refuses a plan with blockers, and one whose blocker count was edited away (I-2)", async () => {
    const blocked = join(scratch, "plan-blocked");
    const { out } = capture();
    // Without --overrides, sp08's 36-character overlay blocks.
    expect(
      await main(
        [
          "plan",
          "--export",
          FIXTURE_DIR,
          "--target",
          "staging",
          "--out",
          blocked,
          "--now",
          NOW,
        ],
        out
      )
    ).toBe(1);
    const wrangler = sqliteWrangler(migratedDatabase());
    const result = await apply(wrangler, ["--env", "dev", "--out", blocked]);
    expect(result.code).toBe(1);
    expect(result.lines.error[0]).toContain("The plan has 1 blocker(s)");
    const manifestPath = join(blocked, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(
      manifestPath,
      JSON.stringify({
        ...manifest,
        report: { ...manifest.report, blockers: 0 },
      })
    );
    const edited = await apply(wrangler, ["--env", "dev", "--out", blocked]);
    expect(edited.code).toBe(1);
    expect(edited.lines.error[0]).toContain(
      "manifest.json does not match the plan that made it"
    );
    expect(wrangler.calls).toEqual([]);
  });

  test("refuses a missing or an edited report.json (I-2)", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    const missing = planCopy("staging");
    rmSync(join(missing, "report.json"));
    const gone = await apply(wrangler, ["--env", "dev", "--out", missing]);
    expect(gone.code).toBe(1);
    expect(gone.lines.error[0]).toContain("report.json is missing");
    const edited = planCopy("staging");
    const reportPath = join(edited, "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.sections[1].counts.migrated += 1;
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const changed = await apply(wrangler, ["--env", "dev", "--out", edited]);
    expect(changed.code).toBe(1);
    expect(changed.lines.error).toEqual([
      "[migrate-convex] apply refused: report.json does not match the plan that made it. Plan again; never edit a plan file.",
    ]);
    expect(wrangler.calls).toEqual([]);
  });
});

describe("apply's preflight", () => {
  async function refusal(
    wrangler: SqliteWrangler,
    env: "dev" | "staging",
    code: string
  ): Promise<void> {
    const dir = env === "dev" ? plans.production : plans.staging;
    const result = await apply(wrangler, ["--env", env, "--out", dir]);
    expect(result.code).toBe(1);
    expect(result.lines.error.join("\n")).toContain(`Refused (${code})`);
    expect(result.lines.error.at(-1)).toMatch(NOTHING_WRITTEN);
    expect(wrangler.files).toEqual([]);
    expect(wrangler.kv.has("catalog:version")).toBe(false);
  }

  test("refuses a database below migration 0012", async () => {
    await refusal(
      sqliteWrangler(migratedDatabase(11)),
      "dev",
      "migrationsBehind"
    );
  });

  test("refuses staging without maintenance on", async () => {
    await refusal(
      sqliteWrangler(migratedDatabase()),
      "staging",
      "maintenanceOff"
    );
    await refusal(
      sqliteWrangler(migratedDatabase(), {
        kv: {
          maintenance: JSON.stringify({ bypassVersion: 1, enabled: false }),
        },
      }),
      "staging",
      "maintenanceOff"
    );
    // The site's parser reads this as off (no bypassVersion): so does apply (I-1).
    await refusal(
      sqliteWrangler(migratedDatabase(), {
        kv: { maintenance: JSON.stringify({ enabled: true }) },
      }),
      "staging",
      "maintenanceOff"
    );
  });

  test("refuses an emitted slug taken by a native row, or by another import", async () => {
    const native = sqliteWrangler(migratedDatabase());
    native.db.run(
      "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES ('native-1', 'mama', 'Mama', 'mama', 'p', 0, 0)"
    );
    await refusal(native, "dev", "slugTakenByNativeRow");
    const other = sqliteWrangler(migratedDatabase());
    other.db.run(
      "INSERT INTO category (id, slug, name, sort_order, created_at, updated_at, legacy_id) VALUES ('other-1', 'familie', 'Familie', 0, 0, 0, 'kc7other')"
    );
    await refusal(other, "dev", "slugTakenByOtherImport");
  });

  test("refuses an emitted share token or Mollie id on a foreign row", async () => {
    const facts = JSON.parse(
      readFileSync(join(plans.production, "preflight.json"), "utf8")
    );
    const token = facts.shareTokens[0].token as string;
    const shares = sqliteWrangler(migratedDatabase());
    shares.db.exec(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES ('u-native', '', 'native@example.test', 1, 0, 0, 'admin');
       INSERT INTO list (id, owner_id, name, created_at, updated_at) VALUES ('l-native', 'u-native', 'L', 0, 0);
       INSERT INTO list_share (id, list_id, token, role, created_by, created_at) VALUES ('s-native', 'l-native', '${token}', 'view', 'u-native', 0);`
    );
    await refusal(shares, "dev", "shareTokenTaken");
    const payments = sqliteWrangler(migratedDatabase());
    payments.db.run(
      "INSERT INTO payment (id, kind, mollie_id, status, amount_cents, created_at, updated_at) VALUES ('p-native', 'initial', 'tr_fixture0001', 'paid', 5000, 0, 0)"
    );
    await refusal(payments, "dev", "mollieIdTaken");
  });

  test("refuses an address another legacy id claimed (task 7 review M-2)", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    wrangler.db.run(
      "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, legacy_id) VALUES ('u-1', '', 'ada.fixture@example.test', 1, 0, 0, 'admin', 'jd7usrOTHER')"
    );
    await refusal(wrangler, "dev", "addressClaimedByOtherLegacyId");
  });

  test("refuses a claim whose legacy id is already on another address (review M-2)", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    wrangler.db.exec(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, legacy_id) VALUES ('u-old', '', 'ada.old@example.test', 1, 0, 0, 'admin', '${ADA}');
       INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES ('u-native', '', 'ada.fixture@example.test', 1, 0, 0, 'user');`
    );
    await refusal(wrangler, "dev", "legacyIdOnOtherAddress");
  });

  test("refuses an import that would leave no admin", async () => {
    // Every Convex admin's address is an existing non-admin account: the
    // claims keep `user`, and D1 has no admin.
    const facts = JSON.parse(
      readFileSync(join(plans.production, "preflight.json"), "utf8")
    );
    const wrangler = sqliteWrangler(migratedDatabase());
    for (const [index, claim] of facts.claims.entries()) {
      if (claim.role === "admin") {
        wrangler.db
          .query(
            "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, '', ?, 1, 0, 0, 'user')"
          )
          .run(`u-${index}`, claim.email);
      }
    }
    await refusal(wrangler, "dev", "noAdmin");
  });

  test("lists claims and kept roles without printing an address", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    for (const statement of buildGrantStatements(PRE_EXISTING, {
      create: true,
      id: "0b7d0a9e-6a8e-4f43-9d1e-6f0a2b9c1d00",
    })) {
      wrangler.db.run(statement);
    }
    const result = await apply(wrangler, [
      "--env",
      "dev",
      "--out",
      plans.production,
      "--dry-run",
    ]);
    expect(result.code).toBe(0);
    const text = [...result.lines.log, ...result.lines.error].join("\n");
    expect(text).toContain(
      "1 existing account(s) will be claimed, 0 already hold their legacy id"
    );
    expect(text).toContain(
      `Kept role: ${PRE_LEGACY} is admin in D1 and user in Convex; the claim never changes it.`
    );
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
    expect(record(plans.production).preflight.claims).toEqual([
      {
        email: PRE_EXISTING,
        legacyId: PRE_LEGACY,
        role: "admin",
        state: "claim",
      },
    ]);
  });
});

describe("apply on each env", () => {
  test("a dry run prints every command (--local on dev) and writes nothing", async () => {
    const wrangler = sqliteWrangler(migratedDatabase());
    const result = await apply(wrangler, [
      "--env",
      "dev",
      "--out",
      plans.staging,
      "--dry-run",
      "--reset",
    ]);
    expect(result.code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(plans.staging, "manifest.json"), "utf8")
    );
    const would = result.lines.log.filter((line) =>
      line.startsWith("[migrate-convex] Would run: ")
    );
    expect(would).toEqual([
      ...[...manifest.reset, ...manifest.files].map(
        (file: { name: string }) =>
          `[migrate-convex] Would run: wrangler d1 execute DB --env dev --local --json --file ${join(plans.staging, file.name)}`
      ),
      "[migrate-convex] Would run: wrangler kv key put catalog:version catalog-version-test --binding KV --env dev --local",
    ]);
    expect(result.lines.log.at(-1)).toBe(
      "[migrate-convex] Dry run: nothing was written to D1 or KV (apply-report.json records it)."
    );
    expect(wrangler.files).toEqual([]);
    expect(wrangler.calls.every((call) => call.includes("--command"))).toBe(
      true
    );
    expect(counts(wrangler).user).toBe(0);
    expect(record(plans.staging).status).toBe("dry-run");
  });

  test("staging and production run --remote; production's dry run needs no --yes", async () => {
    const staging = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    const stagingRun = await apply(staging, [
      "--env",
      "staging",
      "--out",
      plans.staging,
      "--dry-run",
    ]);
    expect(stagingRun.code).toBe(0);
    expect(
      staging.calls.every(
        (call) => call.includes("--remote") && call.includes("staging")
      )
    ).toBe(true);
    expect(
      staging.calls.some((call) =>
        call.join(" ").startsWith("kv key get maintenance")
      )
    ).toBe(true);
    const production = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    const productionRun = await apply(production, [
      "--env",
      "production",
      "--out",
      plans.production,
      "--dry-run",
    ]);
    expect(productionRun.code).toBe(0);
    expect(productionRun.lines.log).toContain(
      `[migrate-convex] Would run: wrangler d1 execute DB --env production --remote --json --file ${join(plans.production, "10-users-001.sql")}`
    );
    expect(production.files).toEqual([]);
  });

  test("applies a production plan with --yes, bumps the catalogue and verifies every count", async () => {
    const dir = planCopy("production");
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    const result = await apply(wrangler, [
      "--env",
      "production",
      "--out",
      dir,
      "--yes",
    ]);
    expect(result.lines.error).toEqual([]);
    expect(result.code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(dir, "manifest.json"), "utf8")
    );
    expect(wrangler.files).toEqual(
      manifest.files.map((file: { name: string }) => join(dir, file.name))
    );
    expect(wrangler.kv.get("catalog:version")).toBe("catalog-version-test");
    const applied = record(dir);
    expect(applied.status).toBe("applied");
    expect(
      applied.counts.filter(
        (entry: { status: string }) => entry.status !== "ok"
      )
    ).toEqual([]);
    expect(count(wrangler, "SELECT count(*) AS n FROM sponsorship_token")).toBe(
      1
    );
    const text = [...result.lines.log, ...result.lines.error].join("\n");
    for (const secret of FIXTURE_SECRETS) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("apply's verification and progress", () => {
  test("on production, more rows than the report is a loud warning, not a failure (review M-4)", async () => {
    const dir = planCopy("production");
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    wrangler.db.run(
      "INSERT INTO audit_log (id, action, target_type, data, created_at) VALUES ('native-legacy', 'legacy', 'system', '{}', 0)"
    );
    const result = await apply(wrangler, [
      "--env",
      "production",
      "--out",
      dir,
      "--yes",
    ]);
    expect(result.code).toBe(0);
    expect(result.lines.error).toEqual([
      "[migrate-convex] WARNING: on production, audit_log (10 in D1, 9 in the report) hold more rows than the report. Check that nothing wrote to D1 during the import.",
    ]);
    expect(
      record(dir).counts.find(
        (entry: { name: string }) => entry.name === "audit_log"
      )
    ).toMatchObject({ status: "more" });
  });

  test("records each applied file, and files_applied when the catalogue bump then fails (review M-5)", async () => {
    const dir = planCopy("staging");
    const wrangler = sqliteWrangler(migratedDatabase());
    const failing: SqliteWrangler = {
      ...wrangler,
      run: (args) =>
        args[0] === "kv" && args[2] === "put"
          ? Promise.resolve({ code: 1, stderr: "kv down", stdout: "" })
          : wrangler.run(args),
    };
    const { lines, out } = capture();
    const code = await main(
      ["apply", "--env", "dev", "--out", dir],
      out,
      context(failing)
    );
    expect(code).toBe(1);
    expect(lines.error.join("\n")).toContain(
      "wrangler kv key put catalog:version failed"
    );
    const manifest = JSON.parse(
      readFileSync(join(dir, "manifest.json"), "utf8")
    );
    const recorded = record(dir);
    expect(recorded.status).toBe("files_applied");
    expect(recorded.filesApplied).toEqual(
      manifest.files.map((file: { name: string }) => join(dir, file.name))
    );
  });
});

describe("apply's re-runs and reset", () => {
  test("a re-apply changes no count; --reset then apply gives the same counts and keeps the claimed admin", async () => {
    const dir = planCopy("production");
    const wrangler = sqliteWrangler(migratedDatabase());
    const adminId = "0b7d0a9e-6a8e-4f43-9d1e-6f0a2b9c1d00";
    for (const statement of buildGrantStatements(PRE_EXISTING, {
      create: true,
      id: adminId,
    })) {
      wrangler.db.run(statement);
    }
    expect((await apply(wrangler, ["--env", "dev", "--out", dir])).code).toBe(
      0
    );
    const first = counts(wrangler);
    const second = await apply(wrangler, ["--env", "dev", "--out", dir]);
    expect(second.code).toBe(0);
    expect(second.lines.log.join("\n")).toContain(
      "0 existing account(s) will be claimed, 8 already hold their legacy id"
    );
    expect(counts(wrangler)).toEqual(first);
    const reset = await apply(wrangler, [
      "--env",
      "dev",
      "--out",
      dir,
      "--reset",
    ]);
    expect(reset.code).toBe(0);
    expect(counts(wrangler)).toEqual(first);
    expect(
      wrangler.db
        .query("SELECT id, role, legacy_id FROM user WHERE email = ?")
        .all(PRE_EXISTING)
    ).toEqual([{ id: adminId, legacy_id: PRE_LEGACY, role: "admin" }]);
    expect(
      wrangler.db.query("SELECT id FROM user WHERE legacy_id = ?").all(ADA)
    ).toEqual([{ id: await legacyUuid("user", ADA) }]);
  });

  test("--native-catalog deletes the native rows whose slugs collide, then applies", async () => {
    const dir = planCopy("staging");
    const wrangler = sqliteWrangler(migratedDatabase(), {
      kv: { maintenance: MAINTENANCE_ON },
    });
    wrangler.db.exec(
      `INSERT INTO category (id, slug, name, sort_order, created_at, updated_at, published_at) VALUES ('c-native', 'familie', 'Familie', 0, 0, 0, 0), ('c-keep', 'begroeten', 'Begroeten', 1, 0, 0, 0);
       INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at, published_at) VALUES ('g-native', 'mama', 'Mama', 'mama', 'p', 0, 0, 0), ('g-keep', 'hallo', 'Hallo', 'hallo', 'p', 0, 0, 0);
       INSERT INTO gesture_category (gesture_id, category_id) VALUES ('g-keep', 'c-native'), ('g-keep', 'c-keep');
       INSERT INTO gesture_fts (gesture_id, name, keywords, categories, description) VALUES ('g-native', 'Mama', '', 'Familie', NULL), ('g-keep', 'Hallo', '', 'Familie Begroeten', NULL);`
    );
    const refused = await apply(wrangler, ["--env", "staging", "--out", dir]);
    expect(refused.code).toBe(1);
    const result = await apply(wrangler, [
      "--env",
      "staging",
      "--out",
      dir,
      "--reset",
      "--native-catalog",
    ]);
    expect(result.lines.error).toEqual([]);
    expect(result.code).toBe(0);
    expect(wrangler.files).toContain(join(dir, "reset-native-catalog.sql"));
    expect(
      wrangler.db.query("SELECT id FROM gesture WHERE legacy_id IS NULL").all()
    ).toEqual([{ id: "g-keep" }]);
    expect(
      wrangler.db.query("SELECT id FROM category WHERE legacy_id IS NULL").all()
    ).toEqual([{ id: "c-keep" }]);
    expect(
      wrangler.db
        .query("SELECT categories FROM gesture_fts WHERE gesture_id = 'g-keep'")
        .all()
    ).toEqual([{ categories: "Begroeten" }]);
    expect(
      wrangler.db
        .query(
          "SELECT count(*) AS n FROM gesture_fts WHERE gesture_id = 'g-native'"
        )
        .get()
    ).toEqual({ n: 0 });
  });

  test("a failing file stops apply with its name, and the earlier files stay applied", async () => {
    const dir = planCopy("staging");
    const wrangler = sqliteWrangler(migratedDatabase());
    // A native gesture holds a slug the plan uses, inserted after the
    // preflight read: the catalogue file fails on its UNIQUE index.
    const original = wrangler.run;
    let injected = false;
    const racing: SqliteWrangler = {
      ...wrangler,
      run: (args) => {
        if (!injected && args.includes("--file")) {
          injected = true;
          wrangler.db.run(
            "INSERT INTO gesture (id, slug, name, sort_name, playback_id, created_at, updated_at) VALUES ('native-late', 'mama', 'Mama', 'mama', 'p', 0, 0)"
          );
        }
        return original(args);
      },
    };
    const { lines, out } = capture();
    const code = await main(
      ["apply", "--env", "dev", "--out", dir],
      out,
      context(racing)
    );
    expect(code).toBe(1);
    expect(lines.error.join("\n")).toContain(
      `Failed on ${join(dir, "20-catalog-001.sql")}`
    );
    expect(lines.error.join("\n")).toContain("UNIQUE constraint failed");
    expect(existsSync(join(dir, "apply-report.json"))).toBe(true);
    expect(record(dir)).toMatchObject({
      filesApplied: [join(dir, "10-users-001.sql")],
      status: "failed",
    });
  });
});
