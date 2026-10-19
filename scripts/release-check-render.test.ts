import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  CI_IMAGE,
  DOCKERFILE,
  dockerBuildArgs,
  dockerRunArgs,
  httpSourceProbe,
  LOCAL_IMAGE,
  layerSizes,
  NO_DOCKER_MESSAGE,
  nodeModulesSizeArgs,
  parseNoBuild,
  renderLanePlan,
  STAGING_PORT,
  stagingRunArgs,
} from "./release-check-render";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** `release:check:render` (phase 7 ruling 16), the render lane. */
describe("renderLanePlan", () => {
  test("locally without a Docker daemon: skipped, and said not to be equivalent", () => {
    for (const noBuild of [true, false]) {
      expect(
        renderLanePlan({ ci: false, docker: false, dockerfile: true, noBuild })
      ).toEqual({ kind: "skip", message: NO_DOCKER_MESSAGE });
    }
    expect(NO_DOCKER_MESSAGE).toBe(
      "[render] Docker daemon not available: the render lane runs in CI only (not equivalent)"
    );
  });

  test("in CI a missing daemon fails, never skips", () => {
    expect(
      renderLanePlan({
        ci: true,
        docker: false,
        dockerfile: true,
        noBuild: true,
      }).kind
    ).toBe("fail");
  });

  test("CI runs the image its build step loaded, without building", () => {
    expect(
      renderLanePlan({
        ci: true,
        docker: true,
        dockerfile: true,
        noBuild: true,
      })
    ).toEqual({ build: false, image: CI_IMAGE, kind: "run" });
  });

  test("locally with Docker it builds the image itself", () => {
    expect(
      renderLanePlan({
        ci: false,
        docker: true,
        dockerfile: true,
        noBuild: false,
      })
    ).toEqual({ build: true, image: LOCAL_IMAGE, kind: "run" });
  });

  test("without the Dockerfile the lane fails", () => {
    for (const ci of [true, false]) {
      expect(
        renderLanePlan({ ci, docker: true, dockerfile: false, noBuild: false })
          .kind
      ).toBe("fail");
    }
  });

  test("the Dockerfile exists", () => {
    expect(DOCKERFILE.endsWith("packages/render/container/Dockerfile")).toBe(
      true
    );
    expect(existsSync(DOCKERFILE)).toBe(true);
  });
});

describe("parseNoBuild", () => {
  test("--no-build or SMOG_RENDER_NO_BUILD=1", () => {
    expect(parseNoBuild(["--no-build"], {})).toBe(true);
    expect(parseNoBuild([], { SMOG_RENDER_NO_BUILD: "1" })).toBe(true);
    expect(parseNoBuild([], {})).toBe(false);
    expect(parseNoBuild([], { SMOG_RENDER_NO_BUILD: "" })).toBe(false);
  });
});

describe("the docker commands", () => {
  test("the build is linux/amd64 from the repository root", () => {
    const args = dockerBuildArgs(LOCAL_IMAGE);
    expect(args.slice(0, 3)).toEqual(["build", "--platform", "linux/amd64"]);
    expect(args).toContain(DOCKERFILE);
    expect(args.at(-1)).toBe(
      DOCKERFILE.replace("/packages/render/container/Dockerfile", "")
    );
  });

  test("the container runs on the host network with the dev-only http", () => {
    const args = dockerRunArgs(CI_IMAGE);
    expect(args.join(" ")).toContain("--network host");
    expect(args).toContain("RENDER_ENVIRONMENT=dev");
    expect(args).toContain("RENDER_ALLOW_HTTP=1");
    expect(args).toContain("PORT=8080");
    expect(args.at(-1)).toBe(CI_IMAGE);
  });

  test("a second run as the Container runs it: staging, no http, all interfaces (fix wave M-2)", () => {
    const args = stagingRunArgs(CI_IMAGE);
    expect(args.join(" ")).toContain("--network host");
    expect(args).toContain("RENDER_ENVIRONMENT=staging");
    expect(args).toContain(`PORT=${STAGING_PORT}`);
    expect(args.join(" ")).not.toContain("RENDER_ALLOW_HTTP");
    expect(args).toContain("smog-renderer-lane-staging");
    expect(args.at(-1)).toBe(CI_IMAGE);
    expect(STAGING_PORT).not.toBe(8080);
  });

  test("the staging probe's request is valid but for its http source, so staging refuses it with 422", () => {
    const body = httpSourceProbe();
    // The contract's shape (`renderRequestSchema`): only the source's
    // scheme is wrong for a deployed env.
    expect(body).toMatchObject({
      input: { logoKey: null, v: 1 },
      logoDataUrl: null,
      v: 1,
    });
    expect(body.renderJobId).toMatch(UUID);
    expect(new URL(body.sourceUrl).protocol).toBe("http:");
    expect(new URL(body.uploadUrl).hostname.endsWith(".mux.com")).toBe(true);
  });

  test("the node_modules size is read with du, past tini", () => {
    expect(nodeModulesSizeArgs(CI_IMAGE)).toEqual([
      "run",
      "--rm",
      "--platform",
      "linux/amd64",
      "--entrypoint",
      "du",
      CI_IMAGE,
      "-sh",
      "/app/node_modules",
    ]);
  });

  test("layerSizes names the library and font layers", () => {
    expect(
      layerSizes(
        [
          "120MB\tRUN /bin/sh -c set -eux; apt-get update; apt-get install -y --no-install-recommends ca-certificates libnss3",
          "85MB\tRUN /bin/sh -c set -eux; apt-get update; apt-get install -y --no-install-recommends fonts-noto-core;",
          "0B\tUSER 1001",
        ].join("\n")
      )
    ).toEqual(["Chrome libraries: 120MB", "fonts-noto-core: 85MB"]);
  });
});
