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
import {
  CLIENT_LAZY_MARKERS,
  checkClientRenderIsLazy,
  RENDERER_SERVER_MARKERS,
} from "./deploy-guard";

/**
 * A client manifest as Vite writes it: the entry statically imports a
 * shared chunk, and lazily a route and the wizard's preview. The preview
 * imports Remotion; the route and the preview share a chunk.
 */
const MANIFEST = {
  "_remotion.js": { file: "assets/remotion.js", name: "remotion" },
  "_route-shared.js": { file: "assets/route-shared.js" },
  "_shared.js": { file: "assets/shared.js", name: "shared" },
  "_styles.css": { file: "assets/styles.css" },
  "src/client.tsx": {
    dynamicImports: [
      "src/components/sponsor/sponsor-preview.tsx",
      "src/routes/sponsor.tsx",
    ],
    file: "assets/main.js",
    imports: ["_shared.js"],
    isEntry: true,
  },
  "src/components/sponsor/sponsor-preview.tsx": {
    file: "assets/sponsor-preview.js",
    imports: ["_remotion.js", "_route-shared.js", "_shared.js"],
    isDynamicEntry: true,
  },
  "src/routes/sponsor.tsx": {
    file: "assets/route.js",
    imports: ["_route-shared.js", "_shared.js"],
    isDynamicEntry: true,
  },
};

const REMOTION = CLIENT_LAZY_MARKERS.find(({ name }) => name === "remotion");
const MEDIABUNNY = CLIENT_LAZY_MARKERS.find(
  ({ name }) => name === "mediabunny"
);

function client(contents: Record<string, string>) {
  return Object.entries(contents).map(([file, content]) => ({
    content,
    path: join("dist", "client", file),
  }));
}

describe("checkClientRenderIsLazy (phase 7 ruling 1)", () => {
  it("allows Remotion and mediabunny in a lazy chunk", () => {
    expect(() =>
      checkClientRenderIsLazy(
        MANIFEST,
        client({
          "assets/main.js": "import('./sponsor-preview.js')",
          "assets/remotion.js": `${REMOTION?.marker} ${MEDIABUNNY?.marker}`,
          "assets/shared.js": "export const a = 1",
          "assets/sponsor-preview.js": `x(${JSON.stringify(REMOTION?.marker)})`,
        })
      )
    ).not.toThrow();
  });

  it("refuses them anywhere else: an entry, its imports, a lazy route, a chunk the route shares with the preview", () => {
    for (const { marker, name } of CLIENT_LAZY_MARKERS) {
      for (const file of [
        "assets/main.js",
        "assets/shared.js",
        "assets/route.js",
        "assets/route-shared.js",
        "assets/unlisted.js",
      ]) {
        expect(() =>
          checkClientRenderIsLazy(
            MANIFEST,
            client({
              "assets/main.js": "import('./sponsor-preview.js')",
              "assets/remotion.js": "",
              "assets/shared.js": "",
              [file]: `x(${JSON.stringify(marker)})`,
            })
          )
        ).toThrow(`${name}: ${join("dist", "client", file)}`);
      }
    }
    expect(CLIENT_LAZY_MARKERS.map(({ name }) => name)).toEqual([
      "remotion",
      "mediabunny",
    ]);
  });

  it("refuses a manifest without an entry", () => {
    expect(() => checkClientRenderIsLazy({}, [])).toThrow(
      "no entry chunk in dist/client/.vite/manifest.json"
    );
    expect(() => checkClientRenderIsLazy(null, [])).toThrow(
      "no entry chunk in dist/client/.vite/manifest.json"
    );
  });

  it("finds each marker in the installed package it names", () => {
    const sources: Record<string, string> = {
      // The browser build of each (their `exports` `browser` condition).
      mediabunny: "mediabunny/dist/modules/src/input.js",
      remotion: "remotion/dist/esm/index.mjs",
    };
    const modules = new URL("../../../node_modules/", import.meta.url);
    for (const { marker, name } of CLIENT_LAZY_MARKERS) {
      const file = new URL(sources[name] ?? "", modules);
      expect(readFileSync(file, "utf8")).toContain(marker);
    }
  });
});

describe("deploy-guard --bundle on a built tree (fixture)", () => {
  const root = mkdtempSync(join(tmpdir(), "smog-guard-"));
  afterAll(() => rmSync(root, { force: true, recursive: true }));

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
        join(import.meta.dirname, "deploy-guard.ts"),
        "--bundle",
        "--dist",
        dist,
      ],
      { stderr: "pipe", stdout: "pipe" }
    );
    return {
      code: run.exitCode,
      output: `${run.stdout.toString()}${run.stderr.toString()}`,
    };
  }

  const clean = {
    "client/.vite/manifest.json": JSON.stringify(MANIFEST),
    "client/assets/main.js": "import('./sponsor-preview.js')",
    "client/assets/remotion.js": REMOTION?.marker ?? "",
    "client/assets/shared.js": "",
    "client/assets/sponsor-preview.js": MEDIABUNNY?.marker ?? "",
    "server/index.js": "export default {}",
  };

  it("passes a tree with the render stack only in a lazy client chunk", () => {
    const { code, output } = guard(tree("clean", clean));
    expect(output).toContain("deploy-guard: bundle ok");
    expect(code).toBe(0);
  });

  it("fails a dist/server chunk that contains Remotion", () => {
    const server = RENDERER_SERVER_MARKERS.find(
      ({ name }) => name === "remotion"
    );
    const { code, output } = guard(
      tree("server", {
        ...clean,
        "server/assets/sponsor-preview.js": `x(${JSON.stringify(server?.marker)})`,
      })
    );
    expect(code).toBe(1);
    expect(output).toContain(
      `remotion: ${join(root, "server", "dist", "server", "assets", "sponsor-preview.js")}`
    );
  });

  it("fails an entry chunk that contains Remotion", () => {
    const { code, output } = guard(
      tree("entry", {
        ...clean,
        "client/assets/shared.js": REMOTION?.marker ?? "",
      })
    );
    expect(code).toBe(1);
    expect(output).toContain("outside the sponsor preview's lazy chunks");
  });
});
