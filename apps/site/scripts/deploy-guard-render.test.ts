import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CLIENT_SECRET_MARKERS,
  checkClientHasNoSecrets,
  checkRenderConfig,
  checkServerHasNoRenderer,
  RENDERER_SERVER_MARKERS,
} from "./deploy-guard";

describe("checkServerHasNoRenderer (phase 7 ruling 1)", () => {
  it("refuses Remotion, its renderer and bundler, or mediabunny in dist/server", () => {
    for (const { marker, name } of RENDERER_SERVER_MARKERS) {
      expect(() =>
        checkServerHasNoRenderer([
          { content: "export default {}", path: "dist/server/index.js" },
          {
            content: `x(${JSON.stringify(marker)})`,
            path: "dist/server/assets/r.js",
          },
        ])
      ).toThrow(`${name}: dist/server/assets/r.js`);
    }
    expect(RENDERER_SERVER_MARKERS.map(({ name }) => name)).toEqual([
      "remotion",
      "@remotion/renderer",
      "@remotion/renderer",
      "@remotion/bundler",
      "mediabunny",
    ]);
  });

  it("allows them in dist/client (the wizard's Player loads them lazily)", () => {
    expect(() =>
      checkServerHasNoRenderer(
        RENDERER_SERVER_MARKERS.map(({ marker }) => ({
          content: marker,
          path: "dist/client/assets/sponsor-preview.js",
        }))
      )
    ).not.toThrow();
  });

  it("finds each marker in the installed package it names", () => {
    const sources: Record<string, string> = {
      "@remotion/bundler": "@remotion/bundler/dist/bundle.js",
      "@remotion/renderer": "@remotion/renderer/dist/esm/index.mjs",
      mediabunny: "mediabunny/dist/modules/src/index.js",
      remotion: "remotion/dist/esm/index.mjs",
    };
    const modules = new URL("../../../node_modules/", import.meta.url);
    for (const { marker, name } of RENDERER_SERVER_MARKERS) {
      const file = new URL(sources[name] ?? "", modules);
      expect(readFileSync(file, "utf8")).toContain(marker);
    }
  });
});

describe("the Remotion licence key stays out of the browser build", () => {
  it("is a client secret marker", () => {
    expect(CLIENT_SECRET_MARKERS).toContain("REMOTION_LICENSE_KEY");
    expect(() =>
      checkClientHasNoSecrets([
        {
          content: "env.REMOTION_LICENSE_KEY",
          path: "dist/client/assets/a.js",
        },
      ])
    ).toThrow("dist/client/assets/a.js");
  });
});

/** A built `wrangler.json`, with the keys the guard reads. */
function built(overrides: Record<string, unknown> = {}, renderMode = "fake") {
  return {
    containers: undefined,
    durable_objects: { bindings: [] },
    migrations: [],
    targetEnvironment: "staging",
    vars: { ENVIRONMENT: "staging", RENDER_MODE: renderMode },
    workflows: [],
    ...overrides,
  };
}

const CONTAINER_BLOCK = {
  containers: [
    {
      class_name: "SmogRenderer",
      image: "/repo/packages/render/container/Dockerfile",
      image_build_context: "/repo",
      instance_type: "standard-2",
      max_instances: 2,
      name: "smog-staging-renderer",
    },
  ],
  durable_objects: {
    bindings: [{ class_name: "SmogRenderer", name: "RENDERER" }],
  },
  migrations: [{ new_sqlite_classes: ["SmogRenderer"], tag: "renderer-v1" }],
  workflows: [
    {
      binding: "RENDER_WORKFLOW",
      class_name: "RenderSponsorshipVideo",
      name: "smog-staging-render",
    },
  ],
};

const EXISTING = new Set([
  "/repo/packages/render/container/Dockerfile",
  "/repo",
]);
const exists = (path: string) => EXISTING.has(path);

describe("checkRenderConfig (phase 7 ruling 2)", () => {
  it("passes fake without any render binding (staging today)", () => {
    expect(() => checkRenderConfig(built(), exists)).not.toThrow();
    expect(() =>
      checkRenderConfig(built({ containers: [] }), exists)
    ).not.toThrow();
  });

  it("refuses fake with a Workflow, a container, the RENDERER binding or a migration", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ workflows: CONTAINER_BLOCK.workflows }, "workflows"],
      [{ containers: CONTAINER_BLOCK.containers }, "containers"],
      [{ durable_objects: CONTAINER_BLOCK.durable_objects }, "RENDERER"],
      [{ migrations: CONTAINER_BLOCK.migrations }, "migrations"],
    ];
    for (const [overrides, what] of cases) {
      expect(() => checkRenderConfig(built(overrides), exists)).toThrow(
        `RENDER_MODE=fake must build no ${what}`
      );
    }
  });

  it("passes container with the whole block and existing absolute paths", () => {
    expect(() =>
      checkRenderConfig(built(CONTAINER_BLOCK, "container"), exists)
    ).not.toThrow();
  });

  it("refuses container without the Workflow, the container or RENDERER", () => {
    const missing = [
      ["workflows", "the RENDER_WORKFLOW Workflow (RenderSponsorshipVideo)"],
      ["containers", "the SmogRenderer container"],
      ["durable_objects", "the RENDERER binding (SmogRenderer)"],
      [
        "migrations",
        "the migration that creates SmogRenderer (new_sqlite_classes)",
      ],
    ] as const;
    for (const [key, what] of missing) {
      const config = built(
        {
          ...CONTAINER_BLOCK,
          [key]: key === "durable_objects" ? { bindings: [] } : [],
        },
        "container"
      );
      expect(() => checkRenderConfig(config, exists)).toThrow(
        `RENDER_MODE=container needs ${what}`
      );
    }
    expect(() => checkRenderConfig(built({}, "container"), exists)).toThrow(
      "RENDER_MODE=container needs"
    );
  });

  it("refuses a relative or missing image or build context", () => {
    const relative = structuredClone(CONTAINER_BLOCK);
    const [first] = relative.containers;
    if (first) {
      first.image = "../../packages/render/container/Dockerfile";
    }
    expect(() =>
      checkRenderConfig(built(relative, "container"), exists)
    ).toThrow(
      'containers[0].image must be an absolute path (got "../../packages/render/container/Dockerfile")'
    );
    expect(() =>
      checkRenderConfig(built(CONTAINER_BLOCK, "container"), () => false)
    ).toThrow(
      "containers[0].image does not exist: /repo/packages/render/container/Dockerfile"
    );
    const noContext = structuredClone(CONTAINER_BLOCK);
    Reflect.deleteProperty(
      noContext.containers[0] ?? {},
      "image_build_context"
    );
    expect(() =>
      checkRenderConfig(built(noContext, "container"), exists)
    ).toThrow(
      "containers[0].image_build_context must be an absolute path (got null)"
    );
  });

  it("refuses local (dev only) and an unknown mode in a deploy build", () => {
    expect(() =>
      checkRenderConfig(
        built({ workflows: CONTAINER_BLOCK.workflows }, "local"),
        exists
      )
    ).toThrow("RENDER_MODE=local is dev only");
    expect(() => checkRenderConfig(built({}, "docker"), exists)).toThrow(
      'RENDER_MODE must be fake or container in a deploy build (got "docker")'
    );
  });
});
