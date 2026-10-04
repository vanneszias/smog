import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  DOCKERFILE,
  NO_DOCKER_MESSAGE,
  PLACEHOLDER_MESSAGE,
  renderLaneStep,
} from "./release-check-render";

/**
 * `release:check:render` (phase 7 ruling 16). Task 2 ships the lane with a
 * placeholder body: it passes only while the render image does not exist
 * (`packages/render/container/Dockerfile`, task 4). Once the Dockerfile is
 * there, the placeholder fails, so task 4 cannot land without the lane.
 */
describe("renderLaneStep", () => {
  test("no Dockerfile yet: the placeholder passes with its message", () => {
    for (const docker of [true, false]) {
      for (const ci of [true, false]) {
        expect(renderLaneStep({ ci, docker, dockerfile: false })).toEqual({
          code: 0,
          message: PLACEHOLDER_MESSAGE,
        });
      }
    }
    expect(PLACEHOLDER_MESSAGE).toBe(
      "[render] The render image arrives in phase 7 task 4 (packages/render/container/Dockerfile); nothing to check yet."
    );
  });

  test("with the Dockerfile, the placeholder no longer passes", () => {
    for (const ci of [true, false]) {
      const step = renderLaneStep({ ci, docker: true, dockerfile: true });
      expect(step.code).toBe(1);
      expect(step.message).toContain(
        "[render] packages/render/container/Dockerfile exists, but release:check:render is still the task 2 placeholder"
      );
    }
    // In CI, a missing Docker daemon is a failure, never a skip.
    expect(
      renderLaneStep({ ci: true, docker: false, dockerfile: true }).code
    ).toBe(1);
  });

  test("locally without a Docker daemon: skipped, and said not to be equivalent", () => {
    expect(
      renderLaneStep({ ci: false, docker: false, dockerfile: true })
    ).toEqual({ code: 0, message: NO_DOCKER_MESSAGE });
    expect(NO_DOCKER_MESSAGE).toBe(
      "[render] Docker daemon not available: the render lane runs in CI only (not equivalent)"
    );
  });

  test("the guard reads the real Dockerfile path", () => {
    expect(DOCKERFILE.endsWith("packages/render/container/Dockerfile")).toBe(
      true
    );
    // Today's repository: the placeholder is allowed only while this holds.
    const step = renderLaneStep({
      ci: false,
      docker: false,
      dockerfile: existsSync(DOCKERFILE),
    });
    expect(step.code).toBe(0);
  });
});
