import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkNoRenderConfig,
  checkNoRenderStack,
  RENDER_STACK_MARKERS,
} from "../../../../../apps/site/scripts/deploy-guard";

/**
 * The render pipeline is retired (phase 10b task 9): no build may carry its
 * stack (Remotion, its renderer and bundler, mediabunny) or its Cloudflare
 * config (Workflow, container, Durable Object, migration, `RENDER_MODE`).
 */

function file(path: string, content: string) {
  return { content, path: join("dist", path) };
}

describe("checkNoRenderStack", () => {
  it("passes a build without the render stack", () => {
    expect(() =>
      checkNoRenderStack([
        file("client/assets/main.js", "export const a = 1"),
        file("server/index.js", "export default {}"),
      ])
    ).not.toThrow();
  });

  it("refuses every marker, in the Worker build and in the browser build", () => {
    for (const { marker, name } of RENDER_STACK_MARKERS) {
      for (const path of ["server/index.js", "client/assets/lazy.js"]) {
        expect(() =>
          checkNoRenderStack([file(path, `x(${JSON.stringify(marker)})`)])
        ).toThrow(`${name}: ${join("dist", path)}`);
      }
    }
  });

  it("names Remotion, its renderer and bundler, and mediabunny", () => {
    expect([...new Set(RENDER_STACK_MARKERS.map(({ name }) => name))]).toEqual([
      "remotion",
      "@remotion/renderer",
      "@remotion/bundler",
      "mediabunny",
    ]);
  });
});

describe("checkNoRenderConfig", () => {
  it("passes a built config without render bindings", () => {
    expect(() =>
      checkNoRenderConfig({
        d1_databases: [{ binding: "DB" }],
        vars: { ENVIRONMENT: "staging" },
      })
    ).not.toThrow();
    expect(() =>
      checkNoRenderConfig({ migrations: [], vars: {} })
    ).not.toThrow();
  });

  it("refuses a Workflow, a container, a Durable Object binding, a migration and RENDER_MODE", () => {
    const error = (() => {
      try {
        checkNoRenderConfig({
          containers: [{ class_name: "SmogRenderer" }],
          durable_objects: { bindings: [{ name: "RENDERER" }] },
          migrations: [{ tag: "renderer-v1" }],
          vars: { RENDER_MODE: "fake" },
          workflows: [{ binding: "RENDER_WORKFLOW" }],
        });
        return "";
      } catch (failure) {
        return String(failure);
      }
    })();
    for (const what of [
      "workflows",
      "containers",
      "Durable Object bindings",
      "migrations",
      "a RENDER_MODE var",
    ]) {
      expect(error).toContain(`the build must have no ${what}`);
    }
  });
});

describe("deploy-guard --bundle on a built tree (fixture)", () => {
  const root = mkdtempSync(join(tmpdir(), "smog-guard-"));
  afterAll(() => rmSync(root, { force: true, recursive: true }));

  // Only the render-stack check is under test here: one generous entry.
  writeFileSync(
    join(root, "perf-budget.json"),
    JSON.stringify({
      entries: {
        sponsor: {
          gzip: 5_000_000,
          routes: [["sponsor.tsx"]],
          target: 300_000,
        },
      },
      workerGzip: 5_242_880,
    })
  );

  function tree(name: string, files: Record<string, string>): string {
    // The guard tells the trees apart by `dist/server` and `dist/client`.
    const dist = join(root, name, "dist");
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dist, path)), { recursive: true });
      writeFileSync(join(dist, path), content);
    }
    return dist;
  }

  function guard(dist: string) {
    const run = Bun.spawnSync(
      [
        "bun",
        new URL(
          "../../../../../apps/site/scripts/deploy-guard.ts",
          import.meta.url
        ).pathname,
        "--bundle",
        "--dist",
        dist,
        "--perf-budget",
        join(root, "perf-budget.json"),
      ],
      { stderr: "pipe", stdout: "pipe" }
    );
    return {
      code: run.exitCode,
      output: `${run.stdout.toString()}${run.stderr.toString()}`,
    };
  }

  const remotion = RENDER_STACK_MARKERS[0].marker;

  const clean = {
    "client/.vite/manifest.json": JSON.stringify({
      "src/client.tsx": { file: "assets/main.js", isEntry: true },
      "src/routes/sponsor.tsx?tsr-split=component": {
        file: "assets/route.js",
        isDynamicEntry: true,
      },
    }),
    "client/assets/main.js": "export const a = 1",
    "client/assets/route.js": "export const b = 2",
    "server/index.js": "export default {}",
  };

  it("passes a tree without the render stack", () => {
    const { code, output } = guard(tree("clean", clean));
    expect(output).toContain("deploy-guard: bundle ok");
    expect(code).toBe(0);
  });

  it("fails a dist/server chunk that contains Remotion", () => {
    const { code, output } = guard(
      tree("server", {
        ...clean,
        "server/assets/sponsor-preview.js": `x(${JSON.stringify(remotion)})`,
      })
    );
    expect(code).toBe(1);
    expect(output).toContain(
      `remotion: ${join(root, "server", "dist", "server", "assets", "sponsor-preview.js")}`
    );
  });

  it("fails a browser chunk that contains Remotion", () => {
    const { code, output } = guard(
      tree("entry", {
        ...clean,
        "client/assets/main.js": remotion,
      })
    );
    expect(code).toBe(1);
    expect(output).toContain("retired render stack");
  });
});
