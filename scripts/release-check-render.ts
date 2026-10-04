import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * `bun run release:check:render`, the fourth release lane (phase 7 ruling
 * 16): the SmogRenderer image and a real render with it.
 *
 * 1. Build the image (`packages/render/container/Dockerfile`, context the
 *    repository root), unless `--no-build` (or `SMOG_RENDER_NO_BUILD=1`):
 *    CI builds it first with `docker/build-push-action` (`load: true`, the
 *    GitHub Actions cache) as `smog-renderer:ci`.
 * 2. Log its size and the size of its library and font layers (not gated).
 * 3. Start it with `--network host` (`RENDER_ENVIRONMENT=dev` and
 *    `RENDER_ALLOW_HTTP=1`, so it may read and upload over loopback http).
 * 4. Wait for `GET /health`.
 * 5. Run `bun -F @smog/render test:render` on the host against it: a local
 *    source and upload sink, the MP4 checks and the ΔE probe; the still and
 *    the MP4 land in `packages/render/.render-out` (a CI artifact).
 * 6. Print the container's log (render time) and remove it.
 *
 * Locally it runs only when a Docker daemon answers. Without one it prints
 * `NO_DOCKER_MESSAGE` and passes, like `SMOG_OFFLINE`: not equivalent to
 * CI, which is the authority. In CI a missing daemon fails.
 */

const ROOT = join(import.meta.dir, "..");

export const DOCKERFILE = join(
  ROOT,
  "packages",
  "render",
  "container",
  "Dockerfile"
);

export const NO_DOCKER_MESSAGE =
  "[render] Docker daemon not available: the render lane runs in CI only (not equivalent)";

/** The tag CI's `docker/build-push-action` step loads (`ci.yml`). */
export const CI_IMAGE = "smog-renderer:ci";
/** The tag a local build gets. */
export const LOCAL_IMAGE = "smog-renderer:local";
const CONTAINER_NAME = "smog-renderer-lane";
const PORT = 8080;
const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_REQUEST_TIMEOUT_MS = 5000;
export const OUT_DIR = join(ROOT, "packages", "render", ".render-out");

export type RenderLanePlan =
  | { build: boolean; image: string; kind: "run" }
  | { kind: "fail"; message: string }
  | { kind: "skip"; message: string };

/** What the lane does, from what this machine has. */
export function renderLanePlan({
  ci,
  docker,
  dockerfile,
  noBuild,
}: {
  ci: boolean;
  docker: boolean;
  dockerfile: boolean;
  noBuild: boolean;
}): RenderLanePlan {
  if (!dockerfile) {
    return {
      kind: "fail",
      message:
        "[render] packages/render/container/Dockerfile is missing: the render lane needs the image",
    };
  }
  if (!docker) {
    return ci
      ? {
          kind: "fail",
          message:
            "[render] Docker daemon not available: in CI the render lane must run",
        }
      : { kind: "skip", message: NO_DOCKER_MESSAGE };
  }
  return noBuild
    ? { build: false, image: ci ? CI_IMAGE : LOCAL_IMAGE, kind: "run" }
    : { build: true, image: LOCAL_IMAGE, kind: "run" };
}

/** Whether the lane skips the build (CI built the image already). */
export function parseNoBuild(
  argv: readonly string[],
  env: Record<string, string | undefined>
): boolean {
  return argv.includes("--no-build") || env.SMOG_RENDER_NO_BUILD === "1";
}

export function dockerBuildArgs(image: string): string[] {
  return [
    "build",
    "--platform",
    "linux/amd64",
    "--file",
    DOCKERFILE,
    "--tag",
    image,
    ROOT,
  ];
}

/** The container as the lane runs it: host network, the dev-only http. */
export function dockerRunArgs(image: string): string[] {
  return [
    "run",
    "--detach",
    "--platform",
    "linux/amd64",
    "--network",
    "host",
    "--name",
    CONTAINER_NAME,
    "--env",
    `PORT=${PORT}`,
    "--env",
    "RENDER_ENVIRONMENT=dev",
    "--env",
    "RENDER_ALLOW_HTTP=1",
    image,
  ];
}

/** `du` of the runtime's `node_modules`, in a throwaway container. */
export function nodeModulesSizeArgs(image: string): string[] {
  return [
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--entrypoint",
    "du",
    image,
    "-sh",
    "/app/node_modules",
  ];
}

/** The size of the image's apt layers, from `docker history` lines. */
export function layerSizes(history: string): string[] {
  return history
    .split("\n")
    .filter((line) => line.includes("apt-get install"))
    .map((line) => {
      const [size = "?", command = ""] = line.split("\t");
      const what = command.includes("fonts-noto-core")
        ? "fonts-noto-core"
        : "Chrome libraries";
      return `${what}: ${size}`;
    });
}

async function run(
  command: string[],
  {
    capture = false,
    env,
    quiet = false,
  }: {
    capture?: boolean;
    env?: Record<string, string>;
    /** Drop stderr too (an expected "No such container"). */
    quiet?: boolean;
  } = {}
): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stderr: quiet ? "ignore" : "inherit",
    stdout: capture ? "pipe" : "inherit",
  });
  const stdout = capture ? await new Response(proc.stdout).text() : "";
  return { code: await proc.exited, stdout };
}

async function dockerAnswers(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["docker", "info"], {
      stderr: "ignore",
      stdout: "ignore",
    });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function waitForHealth(url: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling until the container answers.
      const response = await fetch(`${url}/health`, {
        // A container that accepts but never answers must not outlive the
        // deadline (review minor 9).
        signal: AbortSignal.timeout(HEALTH_REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        console.log(`[render] health: ${await response.text()}`);
        return true;
      }
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(1000);
  }
  return false;
}

async function logImage(image: string): Promise<void> {
  const size = await run(
    ["docker", "image", "inspect", "--format", "{{.Size}}", image],
    { capture: true }
  );
  const bytes = Number(size.stdout.trim());
  console.log(
    `[render] image ${image}: ${Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(0)} MiB` : "size unknown"}`
  );
  const history = await run(
    [
      "docker",
      "history",
      "--no-trunc",
      "--format",
      "{{.Size}}\t{{.CreatedBy}}",
      image,
    ],
    { capture: true }
  );
  for (const line of layerSizes(history.stdout)) {
    console.log(`[render] layer ${line}`);
  }
  // The dependency tree, without peers (review I-2).
  const modules = await run(["docker", ...nodeModulesSizeArgs(image)], {
    capture: true,
  });
  console.log(
    `[render] node_modules: ${modules.stdout.trim().split("\t")[0] || "size unknown"}`
  );
}

async function lane(image: string, build: boolean): Promise<number> {
  if (build) {
    console.log(`[render] building ${image}`);
    if ((await run(["docker", ...dockerBuildArgs(image)])).code !== 0) {
      console.error("[render] Failed to build the image");
      return 1;
    }
  }
  await logImage(image);
  // A leftover from an earlier run, usually none.
  await run(["docker", "rm", "--force", CONTAINER_NAME], {
    capture: true,
    quiet: true,
  });
  if (
    (await run(["docker", ...dockerRunArgs(image)], { capture: true })).code !==
    0
  ) {
    console.error("[render] Failed to start the container");
    return 1;
  }
  const url = `http://127.0.0.1:${PORT}`;
  try {
    if (!(await waitForHealth(url))) {
      console.error(`[render] ${url}/health did not answer in time`);
      return 1;
    }
    const started = Date.now();
    const test = await run(["bun", "-F", "@smog/render", "test:render"], {
      env: { RENDER_OUT_DIR: OUT_DIR, RENDER_SERVER_URL: url },
    });
    console.log(
      `[render] test:render ${test.code === 0 ? "passed" : "failed"} in ${Date.now() - started} ms; still and MP4 in ${OUT_DIR}`
    );
    return test.code;
  } finally {
    console.log("[render] container log:");
    await run(["docker", "logs", CONTAINER_NAME]);
    await run(["docker", "rm", "--force", CONTAINER_NAME], { capture: true });
  }
}

if (import.meta.main) {
  const dockerfile = existsSync(DOCKERFILE);
  const plan = renderLanePlan({
    ci: process.env.CI === "true",
    docker: await dockerAnswers(),
    dockerfile,
    noBuild: parseNoBuild(process.argv.slice(2), process.env),
  });
  if (plan.kind === "skip") {
    console.log(plan.message);
    process.exit(0);
  }
  if (plan.kind === "fail") {
    console.error(plan.message);
    process.exit(1);
  }
  process.exit(await lane(plan.image, plan.build));
}
