import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * `bun run release:check:render`, the fourth release lane (phase 7 ruling
 * 16): it builds the render image, starts it, checks `GET /health` and runs
 * `bun -F @smog/render test:render` against it. CI runs it on its own
 * runner (`ci.yml`, matrix `render`); locally `release:check` runs it only
 * when a Docker daemon answers, and otherwise says the lane is CI only.
 *
 * Task 2 ships the lane with this placeholder body. It passes only while
 * the image does not exist (`packages/render/container/Dockerfile`, task
 * 4): once the Dockerfile is there, it fails until task 4 replaces it.
 */

export const DOCKERFILE = join(
  import.meta.dir,
  "..",
  "packages",
  "render",
  "container",
  "Dockerfile"
);

export const PLACEHOLDER_MESSAGE =
  "[render] The render image arrives in phase 7 task 4 (packages/render/container/Dockerfile); nothing to check yet.";

export const NO_DOCKER_MESSAGE =
  "[render] Docker daemon not available: the render lane runs in CI only (not equivalent)";

const PLACEHOLDER_STALE =
  "[render] packages/render/container/Dockerfile exists, but release:check:render is still the task 2 placeholder: phase 7 task 4 replaces scripts/release-check-render.ts with the render lane.";

/** What the lane does, from what this machine has. */
export function renderLaneStep({
  ci,
  docker,
  dockerfile,
}: {
  ci: boolean;
  docker: boolean;
  dockerfile: boolean;
}): { code: 0 | 1; message: string } {
  if (!dockerfile) {
    return { code: 0, message: PLACEHOLDER_MESSAGE };
  }
  if (!(docker || ci)) {
    return { code: 0, message: NO_DOCKER_MESSAGE };
  }
  return { code: 1, message: PLACEHOLDER_STALE };
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

if (import.meta.main) {
  const dockerfile = existsSync(DOCKERFILE);
  const step = renderLaneStep({
    ci: process.env.CI === "true",
    docker: dockerfile && (await dockerAnswers()),
    dockerfile,
  });
  if (step.code === 0) {
    console.log(step.message);
  } else {
    console.error(step.message);
  }
  process.exit(step.code);
}
