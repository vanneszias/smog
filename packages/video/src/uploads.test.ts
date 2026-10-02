import { describe, expect, it } from "bun:test";
import { getAsset, listAssets } from "./assets";
import { createMux, MuxApiError } from "./client";
import { MUX_ASSETS_PAGE_MAX } from "./schema";
import { createFakeMux } from "./testing";
import { createDirectUpload, getUpload } from "./uploads";

describe("createMux", () => {
  it("is null without the token id or secret", () => {
    expect(createMux({})).toBeNull();
    expect(createMux({ MUX_TOKEN_ID: "id" })).toBeNull();
    expect(createMux({ MUX_TOKEN_SECRET: "secret" })).toBeNull();
    expect(createMux({ MUX_TOKEN_ID: "", MUX_TOKEN_SECRET: "" })).toBeNull();
  });

  it("talks to api.mux.com with basic auth by default", async () => {
    const calls: Request[] = [];
    const mux = createMux(
      { MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret" },
      {
        fetch: (input, init) => {
          calls.push(new Request(input, init));
          return Promise.resolve(Response.json({ data: [] }));
        },
      }
    );
    if (!mux) {
      throw new Error("expected a client");
    }
    await listAssets(mux, { limit: 12, page: 1 });
    const [call] = calls;
    expect(call?.url).toBe(
      "https://api.mux.com/video/v1/assets?limit=12&page=1"
    );
    expect(call?.headers.get("authorization")).toBe(
      `Basic ${btoa("id:secret")}`
    );
  });
});

describe("createDirectUpload", () => {
  it("sends the ruling 4 settings and returns the id and URL", async () => {
    const fake = createFakeMux();
    const upload = await createDirectUpload(fake.mux, {
      corsOrigin: "http://localhost:5173",
      passthrough: "gesture-upload:abc",
      test: true,
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toEqual({
      body: {
        cors_origin: "http://localhost:5173",
        new_asset_settings: {
          passthrough: "gesture-upload:abc",
          playback_policies: ["public"],
          static_renditions: [{ resolution: "highest" }],
        },
        test: true,
        timeout: 3600,
      },
      method: "POST",
      path: "/video/v1/uploads",
    });
    expect(upload.status).toBe("waiting");
    expect(upload.url).toStartWith("https://");
    expect(new URL(upload.url).hostname).toEndWith(".mux.com");
    expect(upload.passthrough).toBe("gesture-upload:abc");
  });

  it("omits `test` outside dev", async () => {
    const fake = createFakeMux();
    await createDirectUpload(fake.mux, {
      corsOrigin: "https://smog.test",
      passthrough: "gesture-upload:x",
      test: false,
    });
    expect(fake.requests[0]?.body).not.toHaveProperty("test");
  });
});

describe("getUpload and getAsset", () => {
  it("follow an upload to its ready asset", async () => {
    const fake = createFakeMux();
    const { id } = await createDirectUpload(fake.mux, {
      corsOrigin: "https://smog.test",
      passthrough: "gesture-upload:x",
      test: false,
    });
    expect((await getUpload(fake.mux, id))?.status).toBe("waiting");
    const asset = fake.completeUpload(id);
    const upload = await getUpload(fake.mux, id);
    expect(upload).toMatchObject({
      assetId: asset.id,
      status: "asset_created",
    });
    expect(await getAsset(fake.mux, asset.id)).toMatchObject({
      id: asset.id,
      playbackId: null,
      status: "preparing",
      uploadId: id,
    });
    const ready = fake.readyAsset(asset.id);
    expect(await getAsset(fake.mux, asset.id)).toMatchObject({
      playbackId: ready.playbackId,
      status: "ready",
    });
  });

  it("are null for an unknown id", async () => {
    const fake = createFakeMux();
    expect(await getUpload(fake.mux, "nope")).toBeNull();
    expect(await getAsset(fake.mux, "nope")).toBeNull();
  });

  it("throw MuxApiError on a server error", async () => {
    const mux = createMux(
      { MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret" },
      { fetch: () => Promise.resolve(new Response("boom", { status: 502 })) }
    );
    if (!mux) {
      throw new Error("expected a client");
    }
    let caught: unknown;
    try {
      await getUpload(mux, "u1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MuxApiError);
    expect((caught as MuxApiError).status).toBe(502);
  });
});

describe("listAssets", () => {
  it("returns only assets with a public playback id, newest first", async () => {
    const fake = createFakeMux();
    const old = fake.addAsset({ createdAt: 1000, status: "ready" });
    fake.addAsset({ createdAt: 2000, policy: "signed", status: "ready" });
    fake.addAsset({ createdAt: 3000, policy: null, status: "preparing" });
    const recent = fake.addAsset({ createdAt: 4000, status: "ready" });
    const { hasMore, items } = await listAssets(fake.mux, {
      limit: 24,
      page: 1,
    });
    expect(items.map((item) => item.id)).toEqual([recent.id, old.id]);
    expect(items[0]).toEqual({
      aspectRatio: "3:4",
      createdAt: 4000,
      duration: 4.5,
      id: recent.id,
      playbackId: recent.playbackId as string,
      status: "ready",
    });
    expect(hasMore).toBe(false);
  });

  it("pages by `limit` and says when there may be more", async () => {
    const fake = createFakeMux();
    for (let index = 0; index < 5; index += 1) {
      fake.addAsset({ createdAt: index, status: "ready" });
    }
    const first = await listAssets(fake.mux, { limit: 2, page: 1 });
    const last = await listAssets(fake.mux, { limit: 2, page: 3 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(last.items).toHaveLength(1);
    expect(last.hasMore).toBe(false);
  });

  it(`caps the page at ${MUX_ASSETS_PAGE_MAX}`, async () => {
    const fake = createFakeMux();
    await listAssets(fake.mux, { limit: 500, page: 1 });
    expect(fake.requests[0]?.path).toBe(
      `/video/v1/assets?limit=${MUX_ASSETS_PAGE_MAX}&page=1`
    );
  });
});
