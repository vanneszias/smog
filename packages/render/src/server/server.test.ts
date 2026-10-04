/**
 * The render server's request handling (phase 7 ruling 7) with fake ports:
 * no Chrome, no network. The real Remotion port runs in `test:render`.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  RENDER_LOGO_MAX_BYTES,
  type RenderRequest,
  renderResultSchema,
} from "../contract";
import { SourceFetchError, SourceUnreadableError } from "../metadata";
import { RenderServerError } from "./errors";
import type { RenderPort } from "./render";
import {
  createRenderServer,
  type MetadataPort,
  RENDER_BODY_MAX_BYTES,
  type RenderLog,
  type RenderServer,
} from "./server";
import type { UploadArgs, UploadPort } from "./upload";

const JOB = "0b9d4c43-6b5e-4f43-9c43-5b0c8f6c1a11";
const OTHER_JOB = "5f0c2b8e-2a8f-4e0e-8a7c-0d7f2f1c9b22";
const SIGNED_SOURCE =
  "https://master.mux.com/abc/master.mp4?token=SECRET-SIGNATURE";
const UPLOAD = "https://direct-uploads.production.mux.com/upload/xyz?sig=1";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4,
]);
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;

function request(overrides: Partial<RenderRequest> = {}): RenderRequest {
  return {
    input: {
      displayName: "SMOG & Co",
      logoKey: "logos/2b4c",
      sourcePlaybackId: "playback",
      v: 1,
    },
    logoDataUrl: PNG_DATA_URL,
    renderJobId: JOB,
    sourceUrl: SIGNED_SOURCE,
    uploadUrl: UPLOAD,
    v: 1,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://renderer/render", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

/** Polls until `condition` holds (the server runs on the same loop). */
async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    // biome-ignore lint/performance/noAwaitInLoops: polling, one tick at a time.
    await Bun.sleep(1);
  }
}

function deferred(): Deferred {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface FakeRenderCall {
  cancelled: boolean;
  logoDuringRender: Response | null;
  outputPath: string;
  props: Parameters<RenderPort["render"]>[0]["props"];
}

/** A render port that writes a small file, optionally waiting on a gate. */
function fakeRenderer(
  options: {
    error?: Error;
    gate?: () => Promise<void>;
    readLogo?: (props: FakeRenderCall["props"]) => Promise<Response | null>;
  } = {}
): RenderPort & { calls: FakeRenderCall[] } {
  const calls: FakeRenderCall[] = [];
  return {
    calls,
    async render({ cancelSignal, outputPath, props }) {
      const call: FakeRenderCall = {
        cancelled: false,
        logoDuringRender: null,
        outputPath,
        props,
      };
      calls.push(call);
      call.logoDuringRender = (await options.readLogo?.(props)) ?? null;
      await writeFile(outputPath, new Uint8Array(1234));
      if (options.gate) {
        await Promise.race([
          options.gate(),
          new Promise<void>((_, reject) => {
            cancelSignal.addEventListener("abort", () => {
              call.cancelled = true;
              reject(cancelSignal.reason);
            });
          }),
        ]);
      }
      if (options.error) {
        throw options.error;
      }
      return { frames: props.durationInFrames };
    },
  };
}

function fakeUploader(
  options: { error?: Error } = {}
): UploadPort & { calls: (UploadArgs & { body: Uint8Array })[] } {
  const calls: (UploadArgs & { body: Uint8Array })[] = [];
  return {
    calls,
    async upload(args) {
      const body = new Uint8Array(await readFile(args.filePath));
      calls.push({ ...args, body });
      if (options.error) {
        throw options.error;
      }
      return { bytes: body.byteLength };
    },
  };
}

function fakeMetadata(
  options: { error?: Error } = {}
): MetadataPort & { urls: string[] } {
  const urls: string[] = [];
  return {
    read(url) {
      urls.push(url);
      return options.error
        ? Promise.reject(options.error)
        : Promise.resolve({
            durationInFrames: 60,
            durationInSeconds: 2,
            height: 640,
            width: 360,
          });
    },
    urls,
  };
}

function recordingLog(): RenderLog & { lines: string[] } {
  const lines: string[] = [];
  const push =
    (level: string) =>
    (message: string, data?: Record<string, unknown>): void => {
      lines.push(`${level} ${message} ${data ? JSON.stringify(data) : ""}`);
    };
  return {
    error: push("error"),
    info: push("info"),
    lines,
    warn: push("warn"),
  };
}

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "smog-render-server-"));
});

afterEach(async () => {
  await rm(tmp, { force: true, recursive: true });
});

function server(
  ports: {
    allowHttp?: boolean;
    log?: RenderLog;
    metadata?: MetadataPort;
    renderer?: RenderPort;
    uploader?: UploadPort;
  } = {}
): RenderServer {
  return createRenderServer({
    env: {
      PORT: 8080,
      RENDER_ALLOW_HTTP: ports.allowHttp ?? false,
      RENDER_TMP_DIR: tmp,
    },
    health: { browser: "test", version: "test" },
    log: ports.log ?? recordingLog(),
    metadata: ports.metadata ?? fakeMetadata(),
    renderer: ports.renderer ?? fakeRenderer(),
    uploader: ports.uploader ?? fakeUploader(),
  });
}

async function failure(response: Response) {
  const body = renderResultSchema.parse(await response.json());
  if (body.ok) {
    throw new Error("expected a failure");
  }
  return { code: body.code, message: body.message, status: response.status };
}

const LOOPBACK = { remoteAddress: "127.0.0.1" };

describe("GET /health", () => {
  it("answers ok with the version and the browser", async () => {
    const response = await server().fetch(
      new Request("http://renderer/health")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      browser: "test",
      ok: true,
      version: "test",
    });
  });
});

describe("POST /render refusals", () => {
  it("a body over 4 MiB is invalidInput (422)", async () => {
    const big = "x".repeat(RENDER_BODY_MAX_BYTES + 1);
    expect(await failure(await server().fetch(post(big)))).toMatchObject({
      code: "invalidInput",
      status: 422,
    });
    // Without a Content-Length too (the stream is counted).
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const streamed = new Request("http://renderer/render", {
      body: stream,
      method: "POST",
    });
    expect(await failure(await server().fetch(streamed))).toMatchObject({
      code: "invalidInput",
      status: 422,
    });
  });

  it("a body that is not JSON, or not the schema, is invalidInput", async () => {
    expect(await failure(await server().fetch(post("{")))).toMatchObject({
      code: "invalidInput",
      status: 422,
    });
    const wrongVersion = await failure(
      await server().fetch(post({ ...request(), v: 2 }))
    );
    expect(wrongVersion).toMatchObject({ code: "invalidInput", status: 422 });
    expect(wrongVersion.message).toContain("v");
  });

  it("an http: URL without RENDER_ALLOW_HTTP is invalidInput", async () => {
    await Promise.all(
      (["sourceUrl", "uploadUrl"] as const).map(async (field) => {
        const response = await server().fetch(
          post(request({ [field]: "http://stream.mux.com/a.mp4" }))
        );
        const answer = await failure(response);
        expect(answer).toMatchObject({ code: "invalidInput", status: 422 });
        expect(answer.message).toContain(field);
        expect(answer.message).not.toContain("http://");
      })
    );
  });

  it("an upload URL off *.mux.com is invalidInput unless RENDER_ALLOW_HTTP", async () => {
    await Promise.all(
      [
        "https://storage.googleapis.com/upload",
        "https://mux.com.evil.example/upload",
        "https://evilmux.com/upload",
      ].map(async (uploadUrl) => {
        const answer = await failure(
          await server().fetch(post(request({ uploadUrl })))
        );
        expect(answer).toMatchObject({ code: "invalidInput", status: 422 });
        expect(answer.message).toContain("uploadUrl");
      })
    );
    const uploader = fakeUploader();
    const allowed = await server({ allowHttp: true, uploader }).fetch(
      post(
        request({
          sourceUrl: "http://127.0.0.1:9/source.mp4",
          uploadUrl: "http://127.0.0.1:9/upload",
        })
      )
    );
    expect(allowed.status).toBe(200);
    expect(uploader.calls[0]?.url).toBe("http://127.0.0.1:9/upload");
  });

  it("a logo over 2 MiB is invalidInput", async () => {
    const bytes = new Uint8Array(RENDER_LOGO_MAX_BYTES + 3);
    bytes.set(PNG);
    const logoDataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const answer = await failure(
      await server().fetch(post(request({ logoDataUrl })))
    );
    expect(answer).toMatchObject({ code: "invalidInput", status: 422 });
    expect(answer.message).toContain("logoDataUrl");
  });

  it("a logo whose bytes are not its type is logoUnreadable", async () => {
    const jpegClaim = `data:image/jpeg;base64,${Buffer.from(PNG).toString("base64")}`;
    const renderer = fakeRenderer();
    const answer = await failure(
      await server({ renderer }).fetch(
        post(request({ logoDataUrl: jpegClaim }))
      )
    );
    expect(answer).toMatchObject({ code: "logoUnreadable", status: 422 });
    expect(renderer.calls).toHaveLength(0);
  });

  it("an unknown route is 404 and a wrong method 405", async () => {
    const app = server();
    expect((await app.fetch(new Request("http://renderer/nope"))).status).toBe(
      404
    );
    expect(
      (await app.fetch(new Request("http://renderer/render"))).status
    ).toBe(405);
  });
});

describe("POST /render, the happy path", () => {
  it("reads the metadata, renders, PUTs the file and answers the result", async () => {
    const metadata = fakeMetadata();
    const uploader = fakeUploader();
    let app: RenderServer | null = null;
    const renderer = fakeRenderer({
      readLogo: async (props) => {
        // The render's browser fetches the logo from the server itself.
        const url = new URL(props.logoUrl ?? "http://none/");
        const served = await (app as RenderServer).fetch(
          new Request(`http://renderer${url.pathname}`),
          LOOPBACK
        );
        // Read now: the file is deleted once the render has settled.
        return new Response(await served.arrayBuffer(), {
          headers: served.headers,
          status: served.status,
        });
      },
    });
    app = server({ metadata, renderer, uploader });

    const response = await app.fetch(post(request()));
    expect(response.status).toBe(200);
    const body = renderResultSchema.parse(await response.json());
    expect(body).toMatchObject({
      bytes: 1234,
      frames: 60,
      height: 640,
      ok: true,
      width: 360,
    });

    expect(metadata.urls).toEqual([SIGNED_SOURCE]);
    const [call] = renderer.calls;
    expect(call?.props).toEqual({
      background: { kind: "video", src: SIGNED_SOURCE },
      displayName: "SMOG & Co",
      durationInFrames: 60,
      height: 640,
      logoUrl: `http://127.0.0.1:8080/assets/${JOB}/logo`,
      width: 360,
    });
    // The logo was served during the render, with its type and bytes.
    expect(call?.logoDuringRender?.status).toBe(200);
    expect(call?.logoDuringRender?.headers.get("content-type")).toBe(
      "image/png"
    );
    expect(
      new Uint8Array(
        (await call?.logoDuringRender?.arrayBuffer()) ?? new ArrayBuffer(0)
      )
    ).toEqual(PNG);

    expect(uploader.calls).toHaveLength(1);
    expect(uploader.calls[0]?.url).toBe(UPLOAD);
    expect(uploader.calls[0]?.filePath).toBe(call?.outputPath ?? "");
    expect(uploader.calls[0]?.body.byteLength).toBe(1234);

    // Afterwards: the logo is gone and the temp files are deleted.
    const after = await app.fetch(
      new Request(`http://renderer/assets/${JOB}/logo`),
      LOOPBACK
    );
    expect(after.status).toBe(404);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("renders without a logo", async () => {
    const renderer = fakeRenderer();
    const response = await server({ renderer }).fetch(
      post(request({ logoDataUrl: null }))
    );
    expect(response.status).toBe(200);
    expect(renderer.calls[0]?.props.logoUrl).toBeNull();
  });

  it("serves a logo only to loopback, and only the current job's", async () => {
    let app: RenderServer | null = null;
    const seen: number[] = [];
    const renderer = fakeRenderer({
      readLogo: async () => {
        const live = app as RenderServer;
        seen.push(
          (
            await live.fetch(
              new Request(`http://renderer/assets/${JOB}/logo`),
              { remoteAddress: "10.0.0.7" }
            )
          ).status,
          (
            await live.fetch(
              new Request(`http://renderer/assets/${OTHER_JOB}/logo`),
              LOOPBACK
            )
          ).status
        );
        return null;
      },
    });
    app = server({ renderer });
    expect((await app.fetch(post(request()))).status).toBe(200);
    expect(seen).toEqual([404, 404]);
  });
});

describe("POST /render, the slot (one job at a time)", () => {
  it("the same job twice cancels the first, and the second completes", async () => {
    const secondGate = deferred();
    const gates = [deferred(), secondGate];
    let attempt = 0;
    const uploader = fakeUploader();
    const renderer = fakeRenderer({
      gate: () => {
        const gate = gates[attempt];
        attempt += 1;
        return gate?.promise ?? Promise.resolve();
      },
    });
    const log = recordingLog();
    const app = server({ log, renderer, uploader });

    const first = app.fetch(post(request({ uploadUrl: `${UPLOAD}&n=1` })));
    await until(() => renderer.calls.length >= 1);
    const firstDir = dirname(renderer.calls[0]?.outputPath ?? "/");
    expect(existsSync(firstDir)).toBe(true);

    const second = app.fetch(post(request({ uploadUrl: `${UPLOAD}&n=2` })));
    const firstAnswer = await failure(await first);
    expect(renderer.calls[0]?.cancelled).toBe(true);
    expect(firstAnswer.code).toBe("renderFailed");
    expect(firstAnswer.message).toContain("superseded");
    // The cancelled attempt's files are gone.
    expect(existsSync(firstDir)).toBe(false);

    await until(() => renderer.calls.length >= 2);
    secondGate.resolve();
    const secondResponse = await second;
    expect(secondResponse.status).toBe(200);
    // Only the second attempt uploaded, to its own URL.
    expect(uploader.calls.map((call) => call.url)).toEqual([`${UPLOAD}&n=2`]);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("a different job while one runs is busy (503), logged as an anomaly", async () => {
    const gate = deferred();
    const renderer = fakeRenderer({ gate: () => gate.promise });
    const log = recordingLog();
    const app = server({ log, renderer });

    const first = app.fetch(post(request()));
    await until(() => renderer.calls.length >= 1);
    const other = await failure(
      await app.fetch(post(request({ renderJobId: OTHER_JOB })))
    );
    expect(other).toMatchObject({ code: "busy", status: 503 });
    expect(log.lines.some((line) => line.startsWith("warn"))).toBe(true);

    gate.resolve();
    expect((await first).status).toBe(200);
    // The slot is free again.
    expect(
      (await app.fetch(post(request({ renderJobId: OTHER_JOB })))).status
    ).toBe(200);
  });

  it("drain() refuses new renders and waits for the running one", async () => {
    const gate = deferred();
    const renderer = fakeRenderer({ gate: () => gate.promise });
    const app = server({ renderer });
    const first = app.fetch(post(request()));
    await until(() => renderer.calls.length >= 1);
    let drained = false;
    const draining = app.drain().then(() => {
      drained = true;
    });
    expect(
      await failure(await app.fetch(post(request({ renderJobId: OTHER_JOB }))))
    ).toMatchObject({ code: "busy", status: 503 });
    await Bun.sleep(5);
    expect(drained).toBe(false);
    gate.resolve();
    expect((await first).status).toBe(200);
    await draining;
    expect(drained).toBe(true);
  });
});

describe("POST /render failures", () => {
  it("an unreadable source is sourceUnreadable (422)", async () => {
    const renderer = fakeRenderer();
    const answer = await failure(
      await server({
        metadata: fakeMetadata({
          error: new SourceUnreadableError("the source has no video track"),
        }),
        renderer,
      }).fetch(post(request()))
    );
    expect(answer).toEqual({
      code: "sourceUnreadable",
      message: "the source has no video track",
      status: 422,
    });
    expect(renderer.calls).toHaveLength(0);
    expect(await readdir(tmp)).toEqual([]);
  });

  it("a source that cannot be fetched is retryable, and its URL never leaks", async () => {
    const log = recordingLog();
    const cause = new Error(`Error fetching ${SIGNED_SOURCE}: 403 Forbidden`);
    const response = await server({
      log,
      metadata: fakeMetadata({ error: new SourceFetchError(403, { cause }) }),
    }).fetch(post(request()));
    const text = await response.clone().text();
    expect(await failure(response)).toEqual({
      code: "renderFailed",
      message: "the source could not be read (HTTP 403)",
      status: 500,
    });
    expect(text).not.toContain("SECRET");
    expect(log.lines.join("\n")).not.toContain("SECRET");
    expect(log.lines.join("\n")).not.toContain("mux.com");
  });

  it("a render error is renderFailed with every URL scrubbed, and cleans up", async () => {
    const log = recordingLog();
    const renderer = fakeRenderer({
      error: new Error(
        `Error loading video from ${SIGNED_SOURCE} (see https://remotion.dev/docs)`
      ),
    });
    const response = await server({ log, renderer }).fetch(post(request()));
    const answer = await failure(response);
    expect(answer.code).toBe("renderFailed");
    expect(answer.status).toBe(500);
    expect(answer.message).toContain("Error loading video from <url>");
    expect(answer.message).not.toContain("SECRET");
    expect(log.lines.join("\n")).not.toContain("SECRET");
    expect(await readdir(tmp)).toEqual([]);
  });

  it("an upload failure answers the uploader's code (uploadFailed, 502)", async () => {
    const uploader = fakeUploader({
      error: new RenderServerError(
        "uploadFailed",
        "the upload was refused (HTTP 403)"
      ),
    });
    expect(
      await failure(await server({ uploader }).fetch(post(request())))
    ).toEqual({
      code: "uploadFailed",
      message: "the upload was refused (HTTP 403)",
      status: 502,
    });
    expect(await readdir(tmp)).toEqual([]);
  });

  it("a thrown non-Error is renderFailed", async () => {
    const renderer: RenderPort = {
      render: () => Promise.reject("boom"),
    };
    expect(
      await failure(await server({ renderer }).fetch(post(request())))
    ).toMatchObject({ code: "renderFailed", status: 500 });
  });
});
