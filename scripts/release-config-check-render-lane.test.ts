import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRenderLaneBuild } from "./release-config-check";

/** The render lane's image build in ci.yml (phase 7 task 4 review, minor 8). */

const CI = readFileSync(
  join(import.meta.dir, "..", ".github", "workflows", "ci.yml"),
  "utf8"
);

describe("checkRenderLaneBuild", () => {
  test("today's ci.yml builds the image and tells the lane not to", () => {
    expect(checkRenderLaneBuild(CI)).toEqual([]);
  });

  test("a changed tag, a dropped load or a missing build step fails", () => {
    expect(
      checkRenderLaneBuild(CI.replace("tags: smog-renderer:ci", "tags: other"))
    ).toContain(
      "ci.yml: the render image build needs with.tags: smog-renderer:ci"
    );
    expect(
      checkRenderLaneBuild(CI.replace("load: true", "load: false"))
    ).toContain("ci.yml: the render image build needs with.load: true");
    expect(
      checkRenderLaneBuild(
        CI.replace("docker/build-push-action@", "docker/other-action@")
      )
    ).toContain(
      "ci.yml: the render leg must build the image with docker/build-push-action"
    );
  });

  test("the artifact upload must include the hidden .render-out", () => {
    expect(
      checkRenderLaneBuild(
        CI.replace("include-hidden-files: true", "include-hidden-files: false")
      )
    ).toContain(
      "ci.yml: the render lane's artifact upload needs include-hidden-files: true for packages/render/.render-out"
    );
  });

  test("the release:check step must pass SMOG_RENDER_NO_BUILD", () => {
    expect(
      checkRenderLaneBuild(CI.replace("SMOG_RENDER_NO_BUILD:", "OTHER_FLAG:"))
    ).toContain(
      "ci.yml: the release:check step must pass SMOG_RENDER_NO_BUILD for the render leg"
    );
  });
});
