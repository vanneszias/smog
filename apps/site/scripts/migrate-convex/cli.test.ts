// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertOutsideWorkTree,
  assertTargetAllowed,
  type CliOptions,
  databaseNameFor,
  parseCliArgs,
  parseJsonc,
  workTreeRoot,
} from "./guard";
import { loadPayloadFor, runCli } from "./index";

/*
 * Everything here is synthetic. The export these tests read is a copy of
 * `fixtures/valid`, made in the OS temp directory — the CLI refuses the
 * fixtures where they live, because they are inside the work tree.
 */
const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const SITE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOCAL_ENV = { CLOUDFLARE_ENV: "staging" };

let scratch: string;
let outsideExport: string;
let outsideReport: string;

beforeAll(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-cli-"));
  outsideExport = path.join(scratch, "export");
  await cp(path.join(FIXTURES, "valid"), outsideExport, { recursive: true });
  outsideReport = path.join(scratch, "report.md");
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function options(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    exportDir: outsideExport,
    reportPath: outsideReport,
    target: "local",
    apply: false,
    maintenanceWindow: false,
    ...overrides,
  };
}

describe("parseCliArgs", () => {
  it("reads --export and --report, and defaults to a local dry run", () => {
    expect(
      parseCliArgs(["--export", "/x/export", "--report", "/x/r.md"])
    ).toEqual({
      exportDir: path.resolve("/x/export"),
      reportPath: path.resolve("/x/r.md"),
      target: "local",
      apply: false,
      maintenanceWindow: false,
    });
  });

  it("reads --target=, --apply and --i-have-a-maintenance-window", () => {
    expect(
      parseCliArgs([
        "--export=/x/e",
        "--report=/x/r.md",
        "--target=production",
        "--apply",
        "--i-have-a-maintenance-window",
      ])
    ).toMatchObject({
      target: "production",
      apply: true,
      maintenanceWindow: true,
    });
  });

  it("requires --export", () => {
    expect(() => parseCliArgs(["--report", "/x/r.md"])).toThrow(/--export/);
  });

  it("requires --report", () => {
    expect(() => parseCliArgs(["--export", "/x/e"])).toThrow(/--report/);
  });

  it("refuses an unknown target rather than falling back to local", () => {
    for (const target of ["prod", "Production", "staging ", ""]) {
      expect(() =>
        parseCliArgs([
          "--export=/x/e",
          "--report=/x/r.md",
          `--target=${target}`,
        ])
      ).toThrow(/--target/);
    }
  });

  it("refuses an unknown flag, so a typo of --apply is not a silent dry run of something else", () => {
    expect(() =>
      parseCliArgs(["--export=/x/e", "--report=/x/r.md", "--aply"])
    ).toThrow(/aply/);
  });
});

/*
 * Review Focus 2: the real export must never land inside the repository,
 * and neither may the report, which names catalogue rows from it.
 */
describe("assertOutsideWorkTree", () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-root-"));
    outside = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-outside-"));
    await mkdir(path.join(root, "nested", "export"), { recursive: true });
    await symlink(
      path.join(root, "nested", "export"),
      path.join(outside, "link-into-root")
    );
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("refuses a directory inside the work tree", () => {
    expect(() =>
      assertOutsideWorkTree(path.join(root, "nested", "export"), "export", root)
    ).toThrow(
      /\[migrate-convex\] Refusing: the export .* inside the git work tree/
    );
  });

  it("refuses the work tree root itself", () => {
    expect(() => assertOutsideWorkTree(root, "export", root)).toThrow(
      /inside the git work tree/
    );
  });

  it("refuses a symlink outside the work tree that points into it", () => {
    expect(() =>
      assertOutsideWorkTree(
        path.join(outside, "link-into-root"),
        "export",
        root
      )
    ).toThrow(/inside the git work tree/);
  });

  it("refuses a report file (not yet written) inside the work tree", () => {
    expect(() =>
      assertOutsideWorkTree(
        path.join(root, "nested", "report.md"),
        "report",
        root
      )
    ).toThrow(
      /\[migrate-convex\] Refusing: the report .* inside the git work tree/
    );
  });

  /*
   * The report is written with `writeFile`, which follows a symlink. So a
   * link outside the tree pointing at a file inside it would put the
   * report in the repository while the path looked fine.
   */
  it("refuses an existing report symlink that points into the work tree", async () => {
    const target = path.join(root, "nested", "existing-report.md");
    await writeFile(target, "old report\n");
    const link = path.join(outside, "report-link.md");
    await symlink(target, link);

    expect(() => assertOutsideWorkTree(link, "report", root)).toThrow(
      /\[migrate-convex\] Refusing: the report .* is a symbolic link/
    );
  });

  it("refuses a dangling report symlink that points into the work tree", async () => {
    const link = path.join(outside, "dangling-report-link.md");
    await symlink(path.join(root, "nested", "not-yet-written.md"), link);

    expect(() => assertOutsideWorkTree(link, "report", root)).toThrow(
      /is a symbolic link/
    );
  });

  it("refuses an existing report file reached through a symlinked directory into the tree", async () => {
    await writeFile(path.join(root, "nested", "export", "report.md"), "x\n");

    expect(() =>
      assertOutsideWorkTree(
        path.join(outside, "link-into-root", "report.md"),
        "report",
        root
      )
    ).toThrow(/inside the git work tree/);
  });

  it("accepts a new plain report file outside the work tree", () => {
    expect(() =>
      assertOutsideWorkTree(
        path.join(outside, "fresh-report.md"),
        "report",
        root
      )
    ).not.toThrow();
  });

  it("refuses a report whose directory does not exist", () => {
    expect(() =>
      assertOutsideWorkTree(
        path.join(outside, "no-such-dir", "report.md"),
        "report",
        root
      )
    ).toThrow(/does not exist/);
  });

  it("accepts a path outside the work tree, including a sibling sharing its name as a prefix", async () => {
    const sibling = `${root}-sibling`;
    await mkdir(sibling, { recursive: true });
    try {
      expect(() =>
        assertOutsideWorkTree(outside, "export", root)
      ).not.toThrow();
      expect(() =>
        assertOutsideWorkTree(sibling, "export", root)
      ).not.toThrow();
    } finally {
      await rm(sibling, { recursive: true, force: true });
    }
  });

  /*
   * Defence in depth: the comparison above only knows this checkout. An
   * export or report in any other git work tree — a second clone, a
   * worktree, some unrelated repository — is just as one `git add -A` away
   * from a commit.
   */
  describe("inside some other git work tree", () => {
    let otherRepo: string;

    beforeAll(async () => {
      otherRepo = await mkdtemp(path.join(os.tmpdir(), "migrate-convex-repo-"));
      execFileSync("git", ["init", "--quiet", otherRepo]);
      await mkdir(path.join(otherRepo, "deep", "export"), { recursive: true });
    });

    afterAll(async () => {
      await rm(otherRepo, { recursive: true, force: true });
    });

    it("refuses an export there", () => {
      expect(() =>
        assertOutsideWorkTree(
          path.join(otherRepo, "deep", "export"),
          "export",
          root
        )
      ).toThrow(
        /\[migrate-convex\] Refusing: the export .* is inside a git work tree/
      );
    });

    it("refuses a report there", () => {
      expect(() =>
        assertOutsideWorkTree(
          path.join(otherRepo, "deep", "report.md"),
          "report",
          root
        )
      ).toThrow(/the report .* is inside a git work tree/);
    });

    /*
     * "Could not check" must not read as "checked and fine": with no git
     * to ask, the path is refused. PATH is emptied for the call and
     * restored.
     */
    it("refuses when git cannot be run to ask", () => {
      const saved = process.env.PATH;
      process.env.PATH = path.join(outside, "no-such-bin");
      try {
        expect(() => assertOutsideWorkTree(outside, "export", root)).toThrow(
          /could not ask git/
        );
      } finally {
        process.env.PATH = saved;
      }
    });
  });

  it("finds this repository's work tree, and refuses the fixtures where they live", () => {
    const top = workTreeRoot();

    expect(existsSync(path.join(top, "apps", "site", "package.json"))).toBe(
      true
    );
    expect(() =>
      assertOutsideWorkTree(path.join(FIXTURES, "valid"), "export", top)
    ).toThrow(/inside the git work tree/);
  });
});

/* Review Focus 4: the wrong database. */
describe("assertTargetAllowed", () => {
  it("allows local only with CLOUDFLARE_ENV=staging and a non-production NODE_ENV", () => {
    expect(() => assertTargetAllowed(options(), LOCAL_ENV)).not.toThrow();
    expect(() =>
      assertTargetAllowed(options(), { ...LOCAL_ENV, NODE_ENV: "test" })
    ).not.toThrow();
    expect(() =>
      assertTargetAllowed(options(), { ...LOCAL_ENV, NODE_ENV: "production" })
    ).toThrow(/NODE_ENV/);
  });

  it("refuses local with CLOUDFLARE_ENV=production or unset", () => {
    expect(() =>
      assertTargetAllowed(options(), { CLOUDFLARE_ENV: "production" })
    ).toThrow(/CLOUDFLARE_ENV/);
    expect(() => assertTargetAllowed(options(), {})).toThrow(/CLOUDFLARE_ENV/);
  });

  it("requires CLOUDFLARE_ENV to equal the remote target exactly", () => {
    const staging = options({ target: "staging" });
    const production = options({
      target: "production",
      maintenanceWindow: true,
    });

    expect(() =>
      assertTargetAllowed(staging, { CLOUDFLARE_ENV: "staging" })
    ).not.toThrow();
    expect(() =>
      assertTargetAllowed(production, { CLOUDFLARE_ENV: "production" })
    ).not.toThrow();

    for (const value of [undefined, "", "production", "staging ", "Staging"]) {
      expect(() =>
        assertTargetAllowed(staging, { CLOUDFLARE_ENV: value })
      ).toThrow(/CLOUDFLARE_ENV must be exactly 'staging'/);
    }
    for (const value of [undefined, "staging", " production"]) {
      expect(() =>
        assertTargetAllowed(production, { CLOUDFLARE_ENV: value })
      ).toThrow(/CLOUDFLARE_ENV must be exactly 'production'/);
    }
  });

  it("refuses production without --i-have-a-maintenance-window, with or without --apply", () => {
    for (const apply of [true, false]) {
      expect(() =>
        assertTargetAllowed(options({ target: "production", apply }), {
          CLOUDFLARE_ENV: "production",
        })
      ).toThrow(/--i-have-a-maintenance-window/);
    }
  });
});

describe("parseJsonc and databaseNameFor", () => {
  it("strips comments without touching // inside strings, and drops trailing commas", () => {
    expect(
      parseJsonc(`{
        // a comment
        "url": "https://example.test/a//b", /* block */
        "list": [1, 2,],
      }`)
    ).toEqual({ url: "https://example.test/a//b", list: [1, 2] });
  });

  /*
   * A remote target must be a D1 entry wrangler marks `remote: true`: one
   * without it is emulated locally by the platform proxy, so the import
   * would "succeed" against a database nobody deploys.
   */
  it("refuses a remote target whose D1 entry is not marked remote", () => {
    const wrangler = (remote: string): string => `{
      "env": {
        "staging": { "d1_databases": [{ "binding": "D1", "database_name": "smog-staging"${remote} }] },
        "production": { "d1_databases": [{ "binding": "D1", "database_name": "smog-production"${remote} }] },
      },
    }`;

    for (const target of ["staging", "production"] as const) {
      for (const remote of ["", ', "remote": false', ', "remote": "true"']) {
        expect(() => databaseNameFor(target, wrangler(remote))).toThrow(
          new RegExp(`Refusing: .*env\\.${target}.*remote`)
        );
      }
      expect(databaseNameFor(target, wrangler(', "remote": true'))).toBe(
        `smog-${target} (remote)`
      );
    }
    // Local is the emulation by definition and never needs the flag.
    expect(databaseNameFor("local", wrangler(""))).toMatch(
      /^smog-staging \(local emulation/
    );
  });

  it("reads each target's D1 database name from wrangler.jsonc", async () => {
    const text = await readFile(path.join(SITE_ROOT, "wrangler.jsonc"), "utf8");

    expect(databaseNameFor("staging", text)).toBe("smog-staging (remote)");
    expect(databaseNameFor("production", text)).toBe(
      "smog-production (remote)"
    );
    expect(databaseNameFor("local", text)).toMatch(
      /^smog-staging \(local emulation/
    );
  });
});

/*
 * The fixtures are hand-written, not sampled: every id is prefixed by what
 * it is, every playback id is `pb_…`, and the aggregate-only tables hold
 * marker lines rather than rows. A real Convex id is 32 lowercase
 * alphanumerics with no underscore, so a row pasted from an export fails
 * the first expectation.
 */
describe("the fixture directory is synthetic by construction", () => {
  const AGGREGATE_ONLY = new Set([
    "users",
    "sponsorships",
    "user_consents",
    "adminLogs",
    "user_favorites",
  ]);

  async function* jsonlFiles(dir: string): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* jsonlFiles(full);
      } else {
        yield full;
      }
    }
  }

  it("holds only prefixed ids, pb_ playback ids and marker lines", async () => {
    let files = 0;
    for await (const file of jsonlFiles(FIXTURES)) {
      files += 1;
      expect(path.basename(file)).toBe("documents.jsonl");
      const table = path.basename(path.dirname(file));
      const lines = (await readFile(file, "utf8"))
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(10);

      for (const line of lines) {
        if (AGGREGATE_ONLY.has(table)) {
          expect(line).toMatch(/^(synthetic|not-json)-[a-z-]+$/);
          continue;
        }
        for (const [, id] of line.matchAll(/"_id":"([^"]*)"/g)) {
          expect(id).toMatch(/^(cat|ges|tbl)_[A-Za-z0-9_]+$/);
        }
        for (const [, playbackId] of line.matchAll(/"playbackId":"([^"]*)"/g)) {
          expect(playbackId).toMatch(/^(pb_[a-z0-9_]+|\s*)$/);
        }
      }
    }
    expect(files).toBeGreaterThan(50);
  });
});

describe("runCli without --apply", () => {
  it("prints the target, the database and the planned counts, loads no Payload, writes no report, and exits 0", async () => {
    const lines: string[] = [];
    let loads = 0;

    const code = await runCli({
      argv: ["--export", outsideExport, "--report", outsideReport],
      env: LOCAL_ENV,
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      loadPayload: () => {
        loads += 1;
        return Promise.reject(new Error("must not connect on a dry run"));
      },
    });
    const output = lines.join("\n");

    expect(code).toBe(0);
    expect(loads).toBe(0);
    expect(existsSync(outsideReport)).toBe(false);
    expect(output).toMatch(/Target:\s+local/);
    expect(output).toMatch(/Database:\s+smog-staging \(local emulation/);
    expect(output).toMatch(/categories\s+2/);
    expect(output).toMatch(/gestures\s+2/);
    expect(output).toMatch(/skipped\s+4/);
    expect(output).toMatch(/Dry run/);
  });
});

describe("runCli refusals", () => {
  const refused = async (
    argv: string[],
    env: Record<string, string | undefined>
  ): Promise<{ code: number; output: string; loads: number }> => {
    const lines: string[] = [];
    let loads = 0;
    const code = await runCli({
      argv,
      env,
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      loadPayload: () => {
        loads += 1;
        return Promise.reject(new Error("must not connect"));
      },
    });
    return { code, output: lines.join("\n"), loads };
  };

  it("refuses the in-repo fixtures as an export, before reading or connecting", async () => {
    const result = await refused(
      [
        "--export",
        path.join(FIXTURES, "valid"),
        "--report",
        outsideReport,
        "--apply",
      ],
      LOCAL_ENV
    );

    expect(result.code).not.toBe(0);
    expect(result.loads).toBe(0);
    expect(result.output).toMatch(/inside the git work tree/);
  });

  it("refuses a report path inside the work tree", async () => {
    const result = await refused(
      [
        "--export",
        outsideExport,
        "--report",
        path.join(SITE_ROOT, "migrate-report.md"),
        "--apply",
      ],
      LOCAL_ENV
    );

    expect(result.code).not.toBe(0);
    expect(result.loads).toBe(0);
    expect(result.output).toMatch(/the report .* inside the git work tree/);
    expect(existsSync(path.join(SITE_ROOT, "migrate-report.md"))).toBe(false);
  });

  it("refuses production without the maintenance flag", async () => {
    const result = await refused(
      [
        "--export",
        outsideExport,
        "--report",
        outsideReport,
        "--target=production",
        "--apply",
      ],
      { CLOUDFLARE_ENV: "production" }
    );

    expect(result.code).not.toBe(0);
    expect(result.loads).toBe(0);
    expect(result.output).toMatch(/--i-have-a-maintenance-window/);
  });

  it("refuses a staging run under CLOUDFLARE_ENV=production", async () => {
    const result = await refused(
      [
        "--export",
        outsideExport,
        "--report",
        outsideReport,
        "--target=staging",
        "--apply",
      ],
      { CLOUDFLARE_ENV: "production" }
    );

    expect(result.code).not.toBe(0);
    expect(result.loads).toBe(0);
  });

  /*
   * Production is empty at a big-bang cutover, so a catalogue document
   * without a legacy id there means the target is not what the operator
   * thinks it is. The stand-in Payload answers the pre-run reads — every
   * count says 3, no planned document exists yet — and records any call
   * that could write.
   */
  it("refuses a production apply when the target already holds catalogue documents without a legacy id", async () => {
    const lines: string[] = [];
    const writes: string[] = [];
    const counted: unknown[] = [];
    const standIn = {
      collections: { "user-consents": { config: { hooks: {} } } },
      count: (args: { collection: string; where?: unknown }) => {
        counted.push(args.collection);
        return Promise.resolve({ totalDocs: 3 });
      },
      find: () => Promise.resolve({ docs: [], hasNextPage: false }),
      create: () => {
        writes.push("create");
        return Promise.reject(new Error("must not write"));
      },
      update: () => {
        writes.push("update");
        return Promise.reject(new Error("must not write"));
      },
      delete: () => {
        writes.push("delete");
        return Promise.reject(new Error("must not write"));
      },
    } as unknown as Payload;

    const code = await runCli({
      argv: [
        "--export",
        outsideExport,
        "--report",
        outsideReport,
        "--target=production",
        "--apply",
        "--i-have-a-maintenance-window",
      ],
      env: { CLOUDFLARE_ENV: "production" },
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      loadPayload: () => Promise.resolve(standIn),
    });
    const output = lines.join("\n");

    expect(code).not.toBe(0);
    expect(counted).toEqual(expect.arrayContaining(["categories", "gestures"]));
    expect(output).toMatch(/without a legacy id: 3 categories, 3 gestures/);
    expect(output).toMatch(
      /\[migrate-convex\] Refusing: .*production.*without a legacy id/
    );
    expect(writes).toEqual([]);
    expect(existsSync(outsideReport)).toBe(false);
  });

  it("prints the banner before connecting, and connects to the named target", async () => {
    const lines: string[] = [];
    const targets: string[] = [];
    const code = await runCli({
      argv: [
        "--export",
        outsideExport,
        "--report",
        outsideReport,
        "--target=staging",
        "--apply",
      ],
      env: { CLOUDFLARE_ENV: "staging" },
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      loadPayload: (target) => {
        targets.push(target);
        lines.push("<connect>");
        return Promise.reject(new Error("stop here"));
      },
    });

    expect(code).not.toBe(0);
    expect(targets).toEqual(["staging"]);
    const connectAt = lines.indexOf("<connect>");
    const banner = lines.slice(0, connectAt).join("\n");
    expect(banner).toMatch(/Target:\s+staging/);
    expect(banner).toMatch(/Database:\s+smog-staging \(remote\)/);
    expect(banner).toMatch(/gestures\s+2/);
    expect(existsSync(outsideReport)).toBe(false);
  });
});

/*
 * `payload.config.ts` decides between local and remote bindings when it is
 * evaluated, from `NODE_ENV` — so the remote loader has to set it, and hand
 * the config a remote platform proxy, before the config is imported.
 */
describe("loadPayloadFor", () => {
  const contextKey = Symbol.for("__cloudflare-context__");
  const WRANGLER_CONFIG = path.join(SITE_ROOT, "wrangler.jsonc");

  /** A stand-in Payload that records every call made on it. */
  const recordingPayload = (binding: unknown, calls: string[]): Payload =>
    new Proxy(
      { db: { binding } },
      {
        get(target, property) {
          if (property in target) {
            return Reflect.get(target, property);
          }
          // Not a thenable: `Promise.resolve` must hand it over as is.
          if (property === "then") {
            return;
          }
          return (...args: unknown[]) => {
            calls.push(String(property));
            return Promise.reject(
              new Error(`unexpected ${String(property)}(${args.length})`)
            );
          };
        },
      }
    ) as unknown as Payload;

  afterAll(() => {
    delete (globalThis as Record<symbol, unknown>)[contextKey];
  });

  it("runs staging and production against remote bindings, set up before the config loads", async () => {
    for (const target of ["staging", "production"] as const) {
      const env: Record<string, string | undefined> = {
        CLOUDFLARE_ENV: target,
      };
      const proxyCalls: unknown[] = [];
      let seenAtLoad: { nodeEnv?: string; context?: unknown } = {};
      const remoteD1 = { remote: target };
      const proxy = { env: { D1: remoteD1 }, cf: {}, ctx: {} };
      const fakePayload = recordingPayload(remoteD1, []);

      const payload = await loadPayloadFor(target, {
        env,
        getPlatformProxy: (opts) => {
          proxyCalls.push(opts);
          return Promise.resolve(proxy);
        },
        loadConfiguredPayload: () => {
          seenAtLoad = {
            nodeEnv: env.NODE_ENV,
            context: (globalThis as Record<symbol, unknown>)[contextKey],
          };
          return Promise.resolve(fakePayload);
        },
      });

      expect(payload).toBe(fakePayload);
      expect(proxyCalls).toEqual([
        {
          environment: target,
          remoteBindings: true,
          configPath: WRANGLER_CONFIG,
        },
      ]);
      expect(seenAtLoad.nodeEnv).toBe("production");
      expect(seenAtLoad.context).toMatchObject({ env: { D1: remoteD1 } });
    }
  });

  it("refuses a Payload whose D1 binding is not the remote proxy's", async () => {
    await expect(
      loadPayloadFor("staging", {
        env: { CLOUDFLARE_ENV: "staging" },
        getPlatformProxy: () =>
          Promise.resolve({ env: { D1: { remote: true } }, cf: {}, ctx: {} }),
        loadConfiguredPayload: () =>
          Promise.resolve(recordingPayload({ local: true }, [])),
      })
    ).rejects.toThrow(
      /\[migrate-convex\] Refusing: .*not the remote D1 binding for staging/
    );
  });

  it("refuses when the remote proxy has no D1 binding at all, even if Payload's is also missing", async () => {
    await expect(
      loadPayloadFor("production", {
        env: { CLOUDFLARE_ENV: "production" },
        getPlatformProxy: () => Promise.resolve({ env: {}, cf: {}, ctx: {} }),
        loadConfiguredPayload: () =>
          Promise.resolve(recordingPayload(undefined, [])),
      })
    ).rejects.toThrow(/not the remote D1 binding for production/);
  });

  /*
   * `payload.config.ts` reads `process.env.NODE_ENV`, so the default must
   * write there, not into a copy. The fake config load keeps the real one
   * from being evaluated under it; NODE_ENV is restored after.
   */
  it("writes NODE_ENV=production to the real process.env by default", async () => {
    const saved = process.env.NODE_ENV;
    const remoteD1 = {};
    let seen: string | undefined;
    try {
      await loadPayloadFor("staging", {
        getPlatformProxy: () =>
          Promise.resolve({ env: { D1: remoteD1 }, cf: {}, ctx: {} }),
        loadConfiguredPayload: () => {
          seen = process.env.NODE_ENV;
          return Promise.resolve(recordingPayload(remoteD1, []));
        },
      });
    } finally {
      const env = process.env as Record<string, string | undefined>;
      if (saved === undefined) {
        Reflect.deleteProperty(env, "NODE_ENV");
      } else {
        env.NODE_ENV = saved;
      }
    }
    expect(seen).toBe("production");
  });

  it("leaves local on the config's own local bindings and never asks for a remote proxy", async () => {
    const env: Record<string, string | undefined> = {
      CLOUDFLARE_ENV: "staging",
    };
    let proxyCalls = 0;

    await loadPayloadFor("local", {
      env,
      getPlatformProxy: () => {
        proxyCalls += 1;
        return Promise.reject(new Error("no remote for local"));
      },
      loadConfiguredPayload: () =>
        Promise.resolve(recordingPayload(undefined, [])),
    });

    expect(proxyCalls).toBe(0);
    expect(env.NODE_ENV).toBeUndefined();
  });

  it("makes the CLI refuse before any read or write when the binding is wrong", async () => {
    const calls: string[] = [];
    const lines: string[] = [];
    const code = await runCli({
      argv: [
        "--export",
        outsideExport,
        "--report",
        outsideReport,
        "--target=staging",
        "--apply",
      ],
      env: { CLOUDFLARE_ENV: "staging" },
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      loadPayload: (target) =>
        loadPayloadFor(target, {
          env: { CLOUDFLARE_ENV: "staging" },
          getPlatformProxy: () =>
            Promise.resolve({ env: { D1: { remote: true } }, cf: {}, ctx: {} }),
          loadConfiguredPayload: () =>
            Promise.resolve(recordingPayload({ local: true }, calls)),
        }),
    });

    expect(code).not.toBe(0);
    expect(calls).toEqual([]);
    expect(lines.join("\n")).toMatch(/not the remote D1 binding for staging/);
    expect(existsSync(outsideReport)).toBe(false);
  });
});
