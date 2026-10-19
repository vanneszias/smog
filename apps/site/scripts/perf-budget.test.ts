import { afterAll, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  budgetFor,
  checkNoSourceMaps,
  checkPerfBudget,
  type EntrySize,
  measureEntries,
  type PerfBudget,
} from "./perf-budget";

const MANIFEST = {
  "_a-only.js": { file: "assets/a-only.js" },
  "_shared.js": { file: "assets/shared.js" },
  "src/client.tsx": {
    file: "assets/main.js",
    imports: ["_shared.js"],
    isEntry: true,
  },
  "src/routes/a.tsx?tsr-split=component": {
    file: "assets/a.js",
    imports: ["_shared.js", "_a-only.js"],
    isDynamicEntry: true,
  },
  "src/routes/b.tsx?tsr-split=component": {
    file: "assets/b.js",
    imports: ["_shared.js"],
    isDynamicEntry: true,
  },
};

// Incompressible-ish text, so the gzip size tracks the length.
function noise(length: number, seed: number): string {
  let state = seed;
  let text = "";
  for (let index = 0; index < length; index += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    text += String.fromCharCode(97 + (state % 26));
  }
  return text;
}

const FILES: Record<string, string> = {
  "assets/a-only.js": noise(3000, 4),
  "assets/a.js": noise(2000, 3),
  "assets/b.js": noise(1000, 5),
  "assets/main.js": noise(5000, 1),
  "assets/shared.js": noise(4000, 2),
};

function read(file: string): string {
  return FILES[file] ?? "";
}

function budget(gzip: { a: number; b: number }): PerfBudget {
  return {
    entries: {
      a: { gzip: gzip.a, routes: [["a.tsx"]], target: 1 },
      ab: { gzip: gzip.b, routes: [["a.tsx"], ["b.tsx"]], target: 1 },
    },
    workerGzip: 1000,
  };
}

describe("measureEntries", () => {
  it("adds the entry's closure and the route's chunks, once each", () => {
    const sizes = measureEntries(MANIFEST, budget({ a: 1, b: 1 }), read);
    // main + shared + a + a-only, and not b.
    expect(sizes.get("a")?.chunks).toBe(4);
    expect(sizes.get("a")?.raw).toBe(5000 + 4000 + 2000 + 3000);
    // `ab` is the larger of its two visits.
    expect(sizes.get("ab")?.gzip).toBe(sizes.get("a")?.gzip ?? 0);
  });

  it("refuses a route with no chunk instead of passing it unmeasured", () => {
    const missing: PerfBudget = {
      entries: { gone: { gzip: 1, routes: [["gone.tsx"]], target: 1 } },
      workerGzip: 1,
    };
    expect(() => measureEntries(MANIFEST, missing, read)).toThrow("gone.tsx");
  });
});

describe("checkPerfBudget", () => {
  const worker = { gzip: 10 };
  const measured = measureEntries(MANIFEST, budget({ a: 1, b: 1 }), read);

  it("passes at the measured size and at its own budget", () => {
    const own = budgetFor(measured.get("a")?.gzip ?? 0);
    const { errors } = checkPerfBudget(
      budget({ a: own, b: own }),
      measured,
      worker
    );
    expect(errors).toEqual([]);
  });

  it("fails when a budget is lowered under the measurement", () => {
    const low = (measured.get("a")?.gzip ?? 0) - 1;
    const { errors } = checkPerfBudget(
      budget({ a: low, b: 1e9 }),
      measured,
      worker
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('entry "a"');
    expect(errors[0]).toContain("over its budget");
  });

  it("fails when an entry was not measured", () => {
    const none = new Map<string, EntrySize>();
    const { errors } = checkPerfBudget(budget({ a: 1, b: 1 }), none, worker);
    expect(errors).toHaveLength(2);
  });

  it("fails when the Worker is over its cap", () => {
    const { errors } = checkPerfBudget(budget({ a: 1e9, b: 1e9 }), measured, {
      gzip: 1001,
    });
    expect(errors.join()).toContain("Worker build");
  });

  it("hints, without failing, when a budget is far above the measurement", () => {
    const { errors, hints } = checkPerfBudget(
      budget({ a: (measured.get("a")?.gzip ?? 0) * 3, b: 1e9 }),
      measured,
      worker
    );
    expect(errors).toEqual([]);
    expect(hints[0]).toContain("lower the budget to");
  });

  it("does not hint at a budget set at measured + 15 %", () => {
    const own = budgetFor(measured.get("a")?.gzip ?? 0);
    const { hints } = checkPerfBudget(
      budget({ a: own, b: own }),
      measured,
      worker
    );
    expect(hints).toEqual([]);
  });
});

describe("checkNoSourceMaps", () => {
  it("passes a build without maps", () => {
    expect(() =>
      checkNoSourceMaps(
        ["dist/client/assets/a.js"],
        [{ content: "x", path: "dist/client/assets/a.js" }]
      )
    ).not.toThrow();
  });

  it("fails on a .map file", () => {
    expect(() =>
      checkNoSourceMaps(["dist/client/assets/a.js.map"], [])
    ).toThrow("source maps");
  });

  it("fails on a sourceMappingURL comment", () => {
    expect(() =>
      checkNoSourceMaps(
        [],
        [{ content: "a\n//# sourceMappingURL=a.js.map", path: "a.js" }]
      )
    ).toThrow("source maps");
  });

  it("keeps sourcemap off in vite.config.ts", () => {
    const config = readFileSync(
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      "utf8"
    );
    expect(config).toContain("sourcemap: false");
    expect(config.includes("sourcemap: true")).toBe(false);
    expect(config.includes("sourcemap: 'hidden'")).toBe(false);
  });
});

describe("perf-budget.json", () => {
  const real: PerfBudget = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../perf-budget.json", import.meta.url)),
      "utf8"
    )
  );

  it("caps the Worker at 5 MiB gzip", () => {
    expect(real.workerGzip).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("holds home to 200 kB and every other entry to 300 kB as targets", () => {
    for (const [name, entry] of Object.entries(real.entries)) {
      expect(entry.target).toBe(name === "home" ? 200_000 : 300_000);
      expect(entry.routes.length).toBeGreaterThan(0);
    }
  });

  it("covers the home page, a gesture page, the sponsor wizard and the admin", () => {
    for (const name of ["home", "gesture", "sponsor", "admin"]) {
      expect(real.entries[name]).toBeDefined();
    }
  });
});

describe("deploy-guard --bundle against a budget (fixture build)", () => {
  const root = mkdtempSync(join(tmpdir(), "smog-perf-"));
  afterAll(() => rmSync(root, { force: true, recursive: true }));

  function run(
    name: string,
    gzip: number,
    extra: Record<string, string> = {}
  ): { code: number; output: string } {
    const dist = join(root, name, "dist");
    const files: Record<string, string> = {
      "client/.vite/manifest.json": JSON.stringify(MANIFEST),
      "server/index.js": "export default {}",
      ...Object.fromEntries(
        Object.entries(FILES).map(([file, text]) => [`client/${file}`, text])
      ),
      ...extra,
    };
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), content);
    }
    const budgetFile = join(root, name, "perf-budget.json");
    writeFileSync(budgetFile, JSON.stringify(budget({ a: gzip, b: gzip })));
    const result = Bun.spawnSync(
      [
        "bun",
        join(import.meta.dirname, "deploy-guard.ts"),
        "--bundle",
        "--dist",
        dist,
        "--perf-budget",
        budgetFile,
      ],
      { stderr: "pipe", stdout: "pipe" }
    );
    return {
      code: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  }

  const measured = measureEntries(MANIFEST, budget({ a: 1, b: 1 }), read);
  const size = measured.get("a")?.gzip ?? 0;

  it("passes a build within its budget", () => {
    const { code, output } = run("within", budgetFor(size));
    expect(output).toContain("deploy-guard: bundle ok");
    expect(code).toBe(0);
  });

  it("fails the build once the budget is lowered under the measurement", () => {
    const { code, output } = run("lowered", size - 1);
    expect(code).toBe(1);
    expect(output).toContain('entry "a"');
    expect(output).toContain("over its budget");
  });

  it("fails a build that ships a source map", () => {
    const { code, output } = run("map", budgetFor(size), {
      "client/assets/main.js.map": "{}",
    });
    expect(code).toBe(1);
    expect(output).toContain("source maps");
  });
});
