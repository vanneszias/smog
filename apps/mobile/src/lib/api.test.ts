import { ApiError, payloadFetch } from "./api";

const ok = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  );

describe("payloadFetch", () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => ok({ docs: [] })) as unknown as typeof fetch;
  });

  it("requests against the configured base URL", async () => {
    await payloadFetch("/gestures");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/gestures"),
      expect.anything()
    );
  });

  it("sends the locale on every read", async () => {
    await payloadFetch("/gestures", { locale: "fr" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("locale=fr"),
      expect.anything()
    );
  });

  it("sends no Authorization header without a session", async () => {
    await payloadFetch("/gestures");

    const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];

    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });

  it("throws ApiError carrying the status on a 4xx", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ errors: [{ message: "Forbidden" }] }), {
          status: 403,
        })
      )
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toMatchObject({
      status: 403,
      code: "Forbidden",
    });
  });

  it("throws ApiError with code network when the request never completes", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed"))
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toMatchObject({
      code: "network",
    });
  });

  it("does not swallow a non-JSON error body", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response("<html>502</html>", { status: 502 }))
    ) as unknown as typeof fetch;

    await expect(payloadFetch("/gestures")).rejects.toBeInstanceOf(ApiError);
  });
});
