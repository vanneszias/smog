import { WorkflowEntrypoint } from "cloudflare:workers";
import { Container } from "@cloudflare/containers";
import { describe, expect, it, vi } from "vitest";
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

  const REQUEST = {
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

  it("httpRenderer: the platform's non-result 503 (no instance free) is busy, a wait (fix wave C-1)", async () => {
    // The containers library's own answer (container.js, `containerFetch`).
    const renderer = httpRenderer(
      "http://renderer.internal",
      () => () =>
        Promise.resolve(
          new Response(
            "There is no Container instance available at this time.\nThis is likely because you have reached your max concurrent instance count",
            { status: 503 }
          )
        )
    );
    expect(await renderer.render(REQUEST)).toEqual({
      code: "busy",
      message: "no renderer instance is available",
      ok: false,
    });
    // The server's own busy is a result, answered as it is.
    const server = httpRenderer(
      "http://renderer.internal",
      () => () =>
        Promise.resolve(
          Response.json(
            { code: "busy", message: "another job renders", ok: false },
            { status: 503 }
          )
        )
    );
    expect(await server.render(REQUEST)).toMatchObject({ code: "busy" });
  });

  it("httpRenderer stops the job's renderer once its answer is in, whatever it was (fix wave C-1)", async () => {
    const released: string[] = [];
    const release = (id: string) => {
      released.push(id);
      return Promise.resolve();
    };
    const ok = httpRenderer(
      "http://renderer.internal",
      () => () =>
        Promise.resolve(
          Response.json({
            bytes: 10,
            frames: 150,
            height: 1920,
            ms: 5,
            ok: true,
            width: 1080,
          })
        ),
      release
    );
    expect(await ok.render(REQUEST)).toMatchObject({ ok: true });
    expect(released).toEqual([REQUEST.renderJobId]);

    const down = httpRenderer(
      "http://renderer.internal",
      () => () => Promise.reject(new Error("network lost")),
      release
    );
    await expect(down.render(REQUEST)).rejects.toThrow("network lost");
    expect(released).toHaveLength(2);

    // A stop that fails is logged; the answer stands.
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failingStop = httpRenderer(
      "http://renderer.internal",
      () => () =>
        Promise.resolve(
          Response.json(
            { code: "invalidInput", message: "x", ok: false },
            { status: 422 }
          )
        ),
      () => Promise.reject(new Error("stub gone"))
    );
    expect(await failingStop.render(REQUEST)).toMatchObject({
      code: "invalidInput",
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
