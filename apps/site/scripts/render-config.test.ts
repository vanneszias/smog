import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  applyRenderGate,
  RENDER_PIPELINE_FLAG_ERROR,
  renderBindings,
} from "../render-config";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DOCKERFILE = join(
  REPO_ROOT,
  "packages",
  "render",
  "container",
  "Dockerfile"
);

const WORKFLOW = (env: string) => ({
  binding: "RENDER_WORKFLOW",
  class_name: "RenderSponsorshipVideo",
  name: `smog-${env}-render`,
});

describe("renderBindings", () => {
  test("names the Workflow and the container per env", () => {
    for (const env of ["dev", "staging", "production"] as const) {
      const bindings = renderBindings(env);
      expect(bindings.workflows).toEqual([WORKFLOW(env)]);
      const [container] = bindings.container.containers;
      expect(container?.name).toBe(`smog-${env}-renderer`);
      expect(container?.class_name).toBe("SmogRenderer");
      expect(container?.instance_type).toBe("standard-2");
      expect(bindings.container.durable_objects).toEqual({
        bindings: [{ class_name: "SmogRenderer", name: "RENDERER" }],
      });
      expect(bindings.container.migrations).toEqual([
        { new_sqlite_classes: ["SmogRenderer"], tag: "renderer-v1" },
      ]);
    }
  });

  test("allows 2 instances in staging and 4 in production (ruling 3)", () => {
    expect(
      renderBindings("staging").container.containers[0]?.max_instances
    ).toBe(2);
    expect(
      renderBindings("production").container.containers[0]?.max_instances
    ).toBe(4);
  });

  test("gives absolute paths: the Dockerfile and the repo root as the build context", () => {
    const [container] = renderBindings("staging").container.containers;
    const image = container?.image ?? "";
    const context = container?.image_build_context ?? "";
    expect(isAbsolute(image)).toBe(true);
    expect(isAbsolute(context)).toBe(true);
    expect(image).toBe(DOCKERFILE);
    expect(context).toBe(REPO_ROOT);
    // The context is the monorepo root (`turbo prune` runs in the image).
    const manifest = JSON.parse(
      readFileSync(join(context, "package.json"), "utf8")
    );
    expect(manifest.name).toBe("smog");
    // Task 4 adds the Dockerfile; once its directory exists, so must it.
    if (existsSync(dirname(image))) {
      expect(existsSync(image)).toBe(true);
    }
  });
});

describe("applyRenderGate", () => {
  test("fake adds nothing, with or without the flag", () => {
    for (const env of ["dev", "staging", "production"] as const) {
      for (const flag of [undefined, "", "1"]) {
        expect(applyRenderGate({ env, flag, renderMode: "fake" })).toEqual({
          add: {},
        });
      }
    }
  });

  test("local in dev adds only the Workflow binding", () => {
    expect(applyRenderGate({ env: "dev", renderMode: "local" })).toEqual({
      add: { workflows: [WORKFLOW("dev")] },
    });
  });

  test("local outside dev is an error", () => {
    for (const env of ["staging", "production"] as const) {
      const result = applyRenderGate({ env, flag: "1", renderMode: "local" });
      expect(result).toEqual({
        error: `[render] RENDER_MODE=local is dev only (env.${env})`,
      });
    }
  });

  test("container without the flag fails the build", () => {
    for (const flag of [undefined, "", "0"]) {
      expect(
        applyRenderGate({ env: "staging", flag, renderMode: "container" })
      ).toEqual({ error: RENDER_PIPELINE_FLAG_ERROR });
    }
    expect(RENDER_PIPELINE_FLAG_ERROR).toBe(
      "[render] RENDER_MODE=container needs SMOG_RENDER_PIPELINE=1 (Workflows and Containers access confirmed; see PROGRESS owner actions)"
    );
  });

  test("container with the flag adds the Workflow and the container block", () => {
    for (const env of ["staging", "production"] as const) {
      const bindings = renderBindings(env);
      expect(
        applyRenderGate({ env, flag: "1", renderMode: "container" })
      ).toEqual({
        add: { workflows: bindings.workflows, ...bindings.container },
      });
    }
  });

  test("a flag that is neither 1 nor unset is a typo, not off", () => {
    for (const flag of ["true", "yes", " 1"]) {
      expect(
        applyRenderGate({ env: "staging", flag, renderMode: "fake" })
      ).toEqual({
        error: `[render] SMOG_RENDER_PIPELINE must be 1 or unset (got ${JSON.stringify(flag)})`,
      });
    }
  });

  test("an unknown RENDER_MODE is an error", () => {
    expect(applyRenderGate({ env: "staging", renderMode: "docker" })).toEqual({
      error:
        '[render] env.staging.vars.RENDER_MODE must be one of container, local, fake (got "docker")',
    });
    expect(applyRenderGate({ env: "staging", renderMode: undefined })).toEqual({
      error:
        "[render] env.staging.vars.RENDER_MODE must be one of container, local, fake (got null)",
    });
  });

  describe("SMOG_DEV_RENDER_MODE (dev's local mode)", () => {
    test("local in dev sets the var and adds the binding", () => {
      expect(
        applyRenderGate({ devMode: "local", env: "dev", renderMode: "fake" })
      ).toEqual({
        add: { workflows: [WORKFLOW("dev")] },
        vars: { RENDER_MODE: "local" },
      });
    });

    test("fake in dev sets the var and adds nothing", () => {
      expect(
        applyRenderGate({ devMode: "fake", env: "dev", renderMode: "fake" })
      ).toEqual({ add: {}, vars: { RENDER_MODE: "fake" } });
    });

    test("an empty value is unset", () => {
      expect(
        applyRenderGate({ devMode: "", env: "dev", renderMode: "fake" })
      ).toEqual({ add: {} });
    });

    test("is refused outside dev, and for container", () => {
      expect(
        applyRenderGate({
          devMode: "local",
          env: "staging",
          renderMode: "fake",
        })
      ).toEqual({
        error:
          "[render] SMOG_DEV_RENDER_MODE is dev only (CLOUDFLARE_ENV=staging)",
      });
      expect(
        applyRenderGate({
          devMode: "container",
          env: "dev",
          renderMode: "fake",
        })
      ).toEqual({
        error:
          '[render] SMOG_DEV_RENDER_MODE must be local or fake (got "container")',
      });
    });
  });
});
