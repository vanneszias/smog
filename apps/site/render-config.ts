import { fileURLToPath } from "node:url";
import type { WorkerConfig } from "@cloudflare/vite-plugin";
import { RENDER_MODES, type RenderMode } from "@smog/config/env/worker";

/**
 * The render gate (phase 7 ruling 2). `wrangler.jsonc` holds no
 * `workflows`, `containers`, `RENDERER` Durable Object binding or DO
 * migration: the Cloudflare Vite plugin's `config` hook (vite.config.ts)
 * adds them at build time, from the env's `RENDER_MODE`:
 *
 * - `fake` adds nothing, so a build's deployed config is the one it always
 *   was (staging today).
 * - `local` (dev only) adds the `RENDER_WORKFLOW` binding; the render server
 *   runs on this machine (`bun -F @smog/render serve`).
 * - `container` adds the Workflow and the container block, and only with
 *   `SMOG_RENDER_PIPELINE=1`: the GitHub environment variable the owner sets
 *   once the env's token can deploy Workflows and Containers and push
 *   images. Without it the build fails; nothing is silently downgraded.
 *
 * Every push to `develop` deploys staging, and a `workflows` binding makes
 * `wrangler deploy` register the Workflow after the script upload: an
 * unconfirmed permission would fail the deploy half done. Hence the gate.
 *
 * Turning the pipeline off again is two steps, in this order: the env's
 * `RENDER_MODE` back to `fake` first, then the flag removed (the flag
 * alone, with `container` still committed, fails every build on purpose).
 * That leaves the container application idle. It does not delete the
 * `SmogRenderer` class: no migration is sent and `src/worker.ts` keeps
 * exporting it. Deleting it would need a `deleted_classes` migration. Jobs
 * in flight should drain first; the watchdog fails a `running` one left
 * past the ceiling (`workflowUnavailable`) and releases its upload.
 *
 * The paths are absolute because the plugin applies this result after it
 * has resolved the file's own container paths (`customizeWorkerConfig` →
 * `defu`): a relative `image` would land verbatim in
 * `dist/server/wrangler.json`, and `wrangler deploy` would resolve it
 * against `dist/server/`. The deploy guard checks they exist.
 *
 * The legacy `containers[].image` form with `migrations` is used: the newer
 * `images` / `scheduling_policy` form needs the declarative `exports` map,
 * which cannot be combined with `migrations` (DECISIONS).
 */

export type RenderEnv = "dev" | "staging" | "production";

/** The Workflow class and the Container class (`src/worker.ts` exports both). */
export const RENDER_WORKFLOW_CLASS = "RenderSponsorshipVideo";
export const RENDERER_CLASS = "SmogRenderer";

/** The Dockerfile of the render image (task 4) and its build context. */
const DOCKERFILE = fileURLToPath(
  new URL("../../packages/render/container/Dockerfile", import.meta.url)
);
/** The repo root: the image runs `turbo prune @smog/render --docker` on it. */
const BUILD_CONTEXT = fileURLToPath(new URL("../..", import.meta.url)).replace(
  /\/$/,
  ""
);

/** Ruling 3: 1 vCPU, 6 GiB, 12 GB; at most 2 in staging and 4 in production. */
const MAX_INSTANCES: Record<RenderEnv, number> = {
  dev: 1,
  production: 4,
  staging: 2,
};

type Containers = NonNullable<WorkerConfig["containers"]>;

export interface RenderBindings {
  container: {
    containers: Containers;
    durable_objects: WorkerConfig["durable_objects"];
    migrations: WorkerConfig["migrations"];
  };
  workflows: WorkerConfig["workflows"];
}

/** The Workflow entry and the container block of `env`. */
export function renderBindings(env: RenderEnv): RenderBindings {
  return {
    container: {
      containers: [
        {
          class_name: RENDERER_CLASS,
          image: DOCKERFILE,
          image_build_context: BUILD_CONTEXT,
          instance_type: "standard-2",
          max_instances: MAX_INSTANCES[env],
          name: `smog-${env}-renderer`,
        },
      ],
      durable_objects: {
        bindings: [{ class_name: RENDERER_CLASS, name: "RENDERER" }],
      },
      migrations: [
        { new_sqlite_classes: [RENDERER_CLASS], tag: "renderer-v1" },
      ],
    },
    workflows: [
      {
        binding: "RENDER_WORKFLOW",
        class_name: RENDER_WORKFLOW_CLASS,
        name: `smog-${env}-render`,
      },
    ],
  };
}

export const RENDER_PIPELINE_FLAG_ERROR =
  "[render] RENDER_MODE=container needs SMOG_RENDER_PIPELINE=1 (Workflows and Containers access confirmed; see PROGRESS owner actions)";

/** The modes `SMOG_DEV_RENDER_MODE` may choose for `vite dev`. */
const DEV_MODES: readonly RenderMode[] = ["local", "fake"];

export type RenderGateResult =
  | { add: Partial<WorkerConfig>; vars?: { RENDER_MODE: RenderMode } }
  | { error: string };

function isRenderMode(value: unknown): value is RenderMode {
  return (RENDER_MODES as readonly unknown[]).includes(value);
}

/**
 * What the build adds for `env` (ruling 2). `renderMode` is the env's
 * `vars.RENDER_MODE`; `flag` is `SMOG_RENDER_PIPELINE`; `devMode` is
 * `SMOG_DEV_RENDER_MODE`, which picks dev's mode when `vite dev` starts
 * (`.dev.vars` is read at runtime, too late for the binding) and also sets
 * the var. `dryMode` is `SMOG_DRY_RENDER_MODE`: `container` builds a
 * staging or production config as if its `RENDER_MODE` were `container`,
 * without editing `wrangler.jsonc`, for the core lane's gate-on dry run
 * (`deploy:dry:render`, fix wave C-1). The deploy guard refuses such a
 * build unless it runs with `--dry-run`, so it never reaches a real deploy.
 */
export function applyRenderGate({
  devMode,
  dryMode,
  env,
  flag,
  renderMode,
}: {
  devMode?: string;
  dryMode?: string;
  env: RenderEnv;
  flag?: string;
  renderMode: unknown;
}): RenderGateResult {
  if (flag !== undefined && flag !== "" && flag !== "1" && flag !== "0") {
    return {
      error: `[render] SMOG_RENDER_PIPELINE must be 1 or unset (got ${JSON.stringify(flag)})`,
    };
  }
  let mode = renderMode;
  let vars: { RENDER_MODE: RenderMode } | undefined;
  if (dryMode) {
    if (env === "dev") {
      return {
        error: `[render] SMOG_DRY_RENDER_MODE is for staging and production dry runs only (CLOUDFLARE_ENV=${env})`,
      };
    }
    if (dryMode !== "container") {
      return {
        error: `[render] SMOG_DRY_RENDER_MODE must be container (got ${JSON.stringify(dryMode)})`,
      };
    }
    mode = dryMode;
    vars = { RENDER_MODE: dryMode };
  }
  if (devMode) {
    if (env !== "dev") {
      return {
        error: `[render] SMOG_DEV_RENDER_MODE is dev only (CLOUDFLARE_ENV=${env})`,
      };
    }
    const chosen = DEV_MODES.find((candidate) => candidate === devMode);
    if (!chosen) {
      return {
        error: `[render] SMOG_DEV_RENDER_MODE must be ${DEV_MODES.join(" or ")} (got ${JSON.stringify(devMode)})`,
      };
    }
    mode = chosen;
    vars = { RENDER_MODE: chosen };
  }
  if (!isRenderMode(mode)) {
    return {
      error: `[render] env.${env}.vars.RENDER_MODE must be one of ${RENDER_MODES.join(", ")} (got ${JSON.stringify(mode ?? null)})`,
    };
  }
  const withVars = (add: Partial<WorkerConfig>): RenderGateResult =>
    vars ? { add, vars } : { add };
  switch (mode) {
    case "fake":
      return withVars({});
    case "local":
      return env === "dev"
        ? withVars({ workflows: renderBindings(env).workflows })
        : { error: `[render] RENDER_MODE=local is dev only (env.${env})` };
    case "container": {
      if (flag !== "1") {
        return { error: RENDER_PIPELINE_FLAG_ERROR };
      }
      const bindings = renderBindings(env);
      return withVars({ workflows: bindings.workflows, ...bindings.container });
    }
    default:
      return mode satisfies never;
  }
}
