import { WorkflowEntrypoint } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { describe, expect, it, vi } from "vitest";
import {
  SmogRenderer as ExportedRenderer,
  RenderSponsorshipVideo as ExportedWorkflow,
} from "../src/worker";
import { RenderSponsorshipVideo } from "../src/worker/render-workflow";
import { rendererOptions, SmogRenderer } from "../src/worker/renderer";

describe("the render classes (phase 7 task 2)", () => {
  it("are exported from the Worker entry, whatever the render mode", () => {
    expect(ExportedWorkflow).toBe(RenderSponsorshipVideo);
    expect(ExportedRenderer).toBe(SmogRenderer);
    expect(RenderSponsorshipVideo.prototype).toBeInstanceOf(WorkflowEntrypoint);
    expect(SmogRenderer.prototype).toBeInstanceOf(Container);
  });

  it("the Workflow only logs and ends as a no-op until task 6", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { run } = RenderSponsorshipVideo.prototype;
    const event = {
      instanceId: "job-1",
      payload: { renderJobId: "job-1" },
      timestamp: new Date(),
      workflowName: "smog-dev-render",
    };
    await expect(
      run.call(
        Object.create(RenderSponsorshipVideo.prototype),
        event,
        {} as never
      )
    ).resolves.toEqual({ outcome: "noop" });
    expect(warn).toHaveBeenCalledWith(
      "[render] RenderSponsorshipVideo is wired in task 6 (job job-1)"
    );
    warn.mockRestore();
  });

  it("the container listens on 8080, sleeps after 10 minutes and reaches the internet", () => {
    expect(rendererOptions({ ENVIRONMENT: "staging" })).toEqual({
      defaultPort: 8080,
      enableInternet: true,
      envVars: { RENDER_ENVIRONMENT: "staging" },
      sleepAfter: "10m",
    });
  });

  it("passes the licence key only when set, and reads an unknown env as production", () => {
    expect(
      rendererOptions({ ENVIRONMENT: "dev", REMOTION_LICENSE_KEY: "" }).envVars
    ).toEqual({ RENDER_ENVIRONMENT: "dev" });
    expect(
      rendererOptions({
        ENVIRONMENT: "production",
        REMOTION_LICENSE_KEY: "key-1",
      }).envVars
    ).toEqual({
      REMOTION_LICENSE_KEY: "key-1",
      RENDER_ENVIRONMENT: "production",
    });
    expect(rendererOptions({ ENVIRONMENT: "preview" }).envVars).toEqual({
      RENDER_ENVIRONMENT: "production",
    });
  });
});
