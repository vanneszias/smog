import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderServerError } from "./errors";
import { createFetchUploader } from "./upload";

const SIGNED = "https://direct-uploads.production.mux.com/upload/x?sig=SECRET";

let dir: string;
let file: string;
const BYTES = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3]);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "smog-render-upload-"));
  file = join(dir, "out.mp4");
  await writeFile(file, BYTES);
});

afterAll(async () => {
  await rm(dir, { force: true, recursive: true });
});

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("createFetchUploader", () => {
  it("PUTs the file with its type and length to the upload URL", async () => {
    const seen: { body: Uint8Array; headers: Headers; method: string }[] = [];
    const server = Bun.serve({
      async fetch(request) {
        seen.push({
          body: new Uint8Array(await request.arrayBuffer()),
          headers: request.headers,
          method: request.method,
        });
        return new Response(null, { status: 200 });
      },
      hostname: "127.0.0.1",
      port: 0,
    });
    try {
      const result = await createFetchUploader().upload({
        filePath: file,
        signal: new AbortController().signal,
        url: `http://127.0.0.1:${server.port}/upload`,
      });
      expect(result).toEqual({ bytes: BYTES.byteLength });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.method).toBe("PUT");
      expect(seen[0]?.headers.get("content-type")).toBe("video/mp4");
      expect(seen[0]?.headers.get("content-length")).toBe(
        String(BYTES.byteLength)
      );
      expect(seen[0]?.body).toEqual(BYTES);
    } finally {
      await server.stop(true);
    }
  });

  it("a refusal is uploadFailed with the status, never the URL", async () => {
    const uploader = createFetchUploader({
      fetch: () =>
        Promise.resolve(new Response(`denied for ${SIGNED}`, { status: 403 })),
    });
    const error = await rejection(
      uploader.upload({
        filePath: file,
        signal: new AbortController().signal,
        url: SIGNED,
      })
    );
    expect(error).toBeInstanceOf(RenderServerError);
    expect(error).toMatchObject({
      code: "uploadFailed",
      message: "the upload was refused (HTTP 403)",
    });
  });

  it("a network fault is uploadFailed with the URL scrubbed", async () => {
    const uploader = createFetchUploader({
      fetch: () =>
        Promise.reject(new TypeError(`fetch failed: connect ${SIGNED}`)),
      retryDelayMs: 1,
    });
    const error = await rejection(
      uploader.upload({
        filePath: file,
        signal: new AbortController().signal,
        url: SIGNED,
      })
    );
    expect(error).toMatchObject({ code: "uploadFailed" });
    expect((error as Error).message).toContain("TypeError: fetch failed");
    expect((error as Error).message).not.toContain("SECRET");
  });

  it("an abort rethrows the signal's reason", async () => {
    const controller = new AbortController();
    const reason = new Error("superseded");
    const uploader = createFetchUploader({
      fetch: (_url, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
          controller.abort(reason);
        }),
    });
    expect(
      await rejection(
        uploader.upload({
          filePath: file,
          signal: controller.signal,
          url: SIGNED,
        })
      )
    ).toBe(reason);
  });
});

describe("one retry of the PUT (review minor 6)", () => {
  function scripted(answers: (number | Error)[]) {
    const calls: string[] = [];
    const uploader = createFetchUploader({
      fetch: (url) => {
        calls.push(url);
        const next = answers.shift() ?? 200;
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(new Response(null, { status: next }));
      },
      retryDelayMs: 1,
    });
    const upload = () =>
      uploader.upload({
        filePath: file,
        signal: new AbortController().signal,
        url: SIGNED,
      });
    return { calls, upload };
  }

  it("a 5xx or a network fault is retried once", async () => {
    const fiveHundred = scripted([503, 200]);
    expect(await fiveHundred.upload()).toEqual({ bytes: BYTES.byteLength });
    expect(fiveHundred.calls).toHaveLength(2);
    const network = scripted([new TypeError("socket hang up"), 200]);
    expect(await network.upload()).toEqual({ bytes: BYTES.byteLength });
    expect(network.calls).toHaveLength(2);
  });

  it("a 4xx is final, and a second failure is uploadFailed", async () => {
    const refused = scripted([403]);
    expect(await rejection(refused.upload())).toMatchObject({
      code: "uploadFailed",
    });
    expect(refused.calls).toHaveLength(1);
    const twice = scripted([502, 502]);
    expect(await rejection(twice.upload())).toMatchObject({
      code: "uploadFailed",
      message: "the upload was refused (HTTP 502)",
    });
    expect(twice.calls).toHaveLength(2);
  });
});
