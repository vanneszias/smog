import { WorkflowEntrypoint } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { describe, expect, it } from "vitest";
import {
  SmogRenderer as ExportedRenderer,
  RenderSponsorshipVideo as ExportedWorkflow,
} from "../src/worker";
import { RenderSponsorshipVideo } from "../src/worker/render-workflow";
import {
  httpRenderer,
  rendererFor,
  rendererOptions,
  SmogRenderer,
} from "../src/worker/renderer";

describe("the render classes (phase 7 task 2)", () => {
  it("are exported from the Worker entry, whatever the render mode", () => {
    expect(ExportedWorkflow).toBe(RenderSponsorshipVideo);
    expect(ExportedRenderer).toBe(SmogRenderer);
    expect(RenderSponsorshipVideo.prototype).toBeInstanceOf(WorkflowEntrypoint);
    expect(SmogRenderer.prototype).toBeInstanceOf(Container);
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

  it("rendererFor: local reaches RENDER_LOCAL_URL, container needs RENDERER, fake has none", () => {
    expect(rendererFor({}, "fake")).toBeNull();
    expect(rendererFor({}, "container")).toBeNull();
    expect(rendererFor({}, "local")).not.toBeNull();
    expect(
      rendererFor(
        { RENDERER: {} as DurableObjectNamespace<SmogRenderer> },
        "container"
      )
    ).not.toBeNull();
  });

  it("httpRenderer posts the request and answers the server's result, whatever its status", async () => {
    const seen: Request[] = [];
    const answer = (status: number, body: unknown) =>
      httpRenderer("http://127.0.0.1:3002", () => (sent) => {
        seen.push(sent);
        return Promise.resolve(Response.json(body, { status }));
      });
    const request = {
      input: {
        displayName: "Acme BV",
        logoKey: null,
        sourcePlaybackId: "pb",
        v: 1 as const,
      },
      logoDataUrl: null,
      renderJobId: crypto.randomUUID(),
      sourceUrl: "https://stream.mux.com/pb/highest.mp4",
      uploadUrl: "https://storage.mux.com/up",
      v: 1 as const,
    };
    const refused = {
      code: "invalidInput",
      message: "renderJobId",
      ok: false,
    };
    expect(await answer(422, refused).render(request)).toEqual(refused);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url).toBe("http://127.0.0.1:3002/render");
    expect(await seen[0]?.json()).toEqual(request);
    // A 502 from a proxy (no render result) throws, so the step retries.
    await expect(
      answer(502, { error: "bad gateway" }).render(request)
    ).rejects.toThrow("The renderer answered 502 without a render result");
  });
});
