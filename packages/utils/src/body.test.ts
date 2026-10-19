import { describe, expect, it } from "bun:test";
import { readCappedBody } from "./body";

function chunked(chunks: Uint8Array[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Request("https://example.test/", {
    body: stream,
    // @ts-expect-error Bun and workerd take `duplex` for a streamed body.
    duplex: "half",
    method: "POST",
  });
}

describe("readCappedBody", () => {
  it("reads a body up to the cap", async () => {
    const request = new Request("https://example.test/", {
      body: "id=tr_abcd",
      method: "POST",
    });
    const read = await readCappedBody(request, 10);
    expect(read.ok).toBe(true);
    expect(read.ok && new TextDecoder().decode(read.bytes)).toBe("id=tr_abcd");
  });

  it("answers an empty body for a request without one", async () => {
    const read = await readCappedBody(
      new Request("https://example.test/", { method: "POST" }),
      10
    );
    expect(read).toEqual({ bytes: new Uint8Array(0), ok: true });
  });

  it("refuses a declared length over the cap before reading (413)", async () => {
    const request = new Request("https://example.test/", {
      body: "x".repeat(11),
      headers: { "content-length": "11" },
      method: "POST",
    });
    expect(await readCappedBody(request, 10)).toEqual({
      ok: false,
      status: 413,
    });
  });

  it("refuses a malformed content-length (400)", async () => {
    const request = new Request("https://example.test/", {
      headers: { "content-length": "1e3" },
      method: "POST",
    });
    expect(await readCappedBody(request, 10)).toEqual({
      ok: false,
      status: 400,
    });
  });

  it("counts a streamed body and stops past the cap (413)", async () => {
    const request = chunked([new Uint8Array(6), new Uint8Array(6)]);
    expect(await readCappedBody(request, 10)).toEqual({
      ok: false,
      status: 413,
    });
  });

  it("joins the chunks of a streamed body", async () => {
    const request = chunked([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5]),
    ]);
    const read = await readCappedBody(request, 5);
    expect(read.ok && [...read.bytes]).toEqual([1, 2, 3, 4, 5]);
  });
});
