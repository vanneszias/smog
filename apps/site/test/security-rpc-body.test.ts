import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  type CappedRequest,
  capRequestBody,
  RPC_MAX_BODY_BYTES,
} from "../src/server/rpc";
import { ORIGIN } from "./helpers";

/*
 * P-10 (phase 9 task 8): the RPC path caps its request body at 5 MiB,
 * for both transports. The check runs before the origin check, the rate
 * limit, the session read and any procedure.
 */

const HEALTH = `${ORIGIN}/api/rpc/system/health`;
/** A public procedure with an input, so the handler really reads the body. */
const SEARCH = `${ORIGIN}/api/rpc/gestures/search`;

/** 6 MiB in 1 MiB chunks, with no declared length. */
function oversizedStream(): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(1024 * 1024).fill(97);
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 1;
      controller.enqueue(chunk);
      if (sent >= 6) {
        controller.close();
      }
    },
  });
}

function padded(bytes: number): string {
  const prefix = '{"json":{},"pad":"';
  const suffix = '"}';
  return `${prefix}${"a".repeat(bytes - prefix.length - suffix.length)}${suffix}`;
}

function post(url: string, body: BodyInit, headers: HeadersInit = {}) {
  return exports.default.fetch(url, {
    body,
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });
}

describe("the RPC request body cap", () => {
  it("is 5 MiB", () => {
    expect(RPC_MAX_BODY_BYTES).toBe(5 * 1024 * 1024);
  });

  it("answers an empty 413 for a body over the cap, with its declared length", async () => {
    const response = await post(HEALTH, padded(RPC_MAX_BODY_BYTES + 1));
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 413 for a streamed body over the cap that declares no length", async () => {
    const response = await exports.default.fetch(SEARCH, {
      body: oversizedStream(),
      duplex: "half",
      headers: { "content-type": "application/json" },
      method: "POST",
    } as RequestInit);
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("");
  });

  it("does not read a streamed body before the handler asks for it", () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const request = new Request(SEARCH, {
      body: stream,
      duplex: "half",
      method: "POST",
    } as RequestInit);
    const capped = capRequestBody(request);
    expect(capped).not.toBeInstanceOf(Response);
    // Nothing is buffered or copied up front: the limit and the session
    // read come first. (The stream may prefetch one chunk at most.)
    expect(pulls).toBeLessThanOrEqual(1);
  });

  it("answers 413 on the OpenAPI transport too", async () => {
    const response = await post(
      `${ORIGIN}/api/openapi/system/health`,
      padded(RPC_MAX_BODY_BYTES + 1)
    );
    expect(response.status).toBe(413);
  });

  it("answers 400 for a malformed content-length, 413 for a declared one over the cap", () => {
    // The Workers runtime will not send a bad one, so the unit level.
    const malformed = capRequestBody(
      new Request(HEALTH, {
        body: "{}",
        headers: { "content-length": "12abc" },
        method: "POST",
      })
    );
    expect((malformed as Response).status).toBe(400);
    const declared = capRequestBody(
      new Request(HEALTH, {
        body: "{}",
        headers: { "content-length": String(RPC_MAX_BODY_BYTES + 1) },
        method: "POST",
      })
    );
    expect((declared as Response).status).toBe(413);
  });

  it("lets a body at the cap through to the procedure", async () => {
    const response = await post(HEALTH, padded(RPC_MAX_BODY_BYTES));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      json: { environment: "dev", ok: true },
    });
  });

  it("lets an ordinary small body and a bodyless GET through", async () => {
    expect((await post(HEALTH, "{}")).status).toBe(200);
    const get = await exports.default.fetch(HEALTH);
    expect(get.status).not.toBe(413);
  });

  it("hands the procedure the whole body when it was streamed", async () => {
    const request = new Request(HEALTH, {
      body: new Blob(['{"json":{}}']).stream(),
      duplex: "half",
      method: "POST",
    } as RequestInit);
    const result = capRequestBody(request);
    expect(result).not.toBeInstanceOf(Response);
    const { exceeded, request: handed } = result as CappedRequest;
    expect(await handed.text()).toBe('{"json":{}}');
    expect(exceeded()).toBe(false);
  });
});
