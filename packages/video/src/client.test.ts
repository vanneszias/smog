import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { MUX_REQUEST_TIMEOUT_MS, type Mux, muxRequest } from "./client";

describe("muxRequest: the timeout (phase 7 fix wave M-1)", () => {
  test("every call carries an abort signal of MUX_REQUEST_TIMEOUT_MS", async () => {
    let seen: AbortSignal | null | undefined;
    const mux: Mux = {
      apiUrl: "https://api.mux.test",
      authorization: "Basic x",
      fetch: (_input, init) => {
        seen = init?.signal;
        return Promise.resolve(Response.json({ data: { id: "a" } }));
      },
    };
    await muxRequest(mux, "/video/v1/assets/a", {
      schema: z.object({ id: z.string() }),
    });
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen?.aborted).toBe(false);
    expect(MUX_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  test("a call that hangs is aborted and throws", async () => {
    const mux: Mux = {
      apiUrl: "https://api.mux.test",
      authorization: "Basic x",
      // Never answers; only the signal ends it.
      fetch: (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
        }),
      timeoutMs: 20,
    };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    try {
      await expect(
        muxRequest(mux, "/video/v1/uploads", {
          method: "POST",
          schema: z.object({ id: z.string() }),
        })
      ).rejects.toMatchObject({ name: "TimeoutError" });
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
  });
});
