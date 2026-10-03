import { describe, expect, it, spyOn } from "bun:test";
import { deleteAsset, getAsset } from "./assets";
import { MuxApiError } from "./client";
import { createFakeMux } from "./testing";

describe("deleteAsset (phase 6 task 5, J-01)", () => {
  it("deletes the asset once: true, then false (404 counts as done)", async () => {
    const fake = createFakeMux();
    const asset = fake.addAsset();

    expect(await deleteAsset(fake.mux, asset.id)).toBe(true);
    expect(fake.assets.has(asset.id)).toBe(false);
    expect(await getAsset(fake.mux, asset.id)).toBeNull();
    expect(await deleteAsset(fake.mux, asset.id)).toBe(false);

    const deletes = fake.requests.filter((r) => r.method === "DELETE");
    expect(deletes.map((r) => r.path)).toEqual([
      `/video/v1/assets/${asset.id}`,
      `/video/v1/assets/${asset.id}`,
    ]);
  });

  it("throws MuxApiError on a Mux failure (the caller logs and swallows it)", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const fake = createFakeMux();
    const asset = fake.addAsset();
    fake.failNext(500);

    await expect(deleteAsset(fake.mux, asset.id)).rejects.toBeInstanceOf(
      MuxApiError
    );
    expect(fake.assets.has(asset.id)).toBe(true);
    error.mockRestore();
  });

  it("encodes the id and sends the basic auth", async () => {
    const calls: Request[] = [];
    const fake = createFakeMux();
    const mux = {
      ...fake.mux,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Request(input, init));
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    };

    expect(await deleteAsset(mux, "a/b")).toBe(true);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe(`${fake.apiUrl}/video/v1/assets/a%2Fb`);
    expect(calls[0]?.headers.get("authorization")).toBe(fake.mux.authorization);
  });
});
