import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { makeCategory, makeGesture } from "@smog/db/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MuxAssetsPage, MuxUploadProgress } from "../src/schema";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  procedureAt,
  signedUp,
  testDb,
} from "./helpers";
import { testMux } from "./mux-fake";

/*
 * `admin.mux.*` against the in-memory Mux fake (`@smog/video/testing`):
 * the upload request matches ruling 4, the status reads the webhook's KV
 * record first and the Mux API after, the asset list hides non-public
 * assets and joins the gestures that use them, and an unconfigured Mux is
 * `INVALID_STATE`.
 */

const GESTURE_PASSTHROUGH =
  /^gesture-upload:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MUX_HOST = /\.mux\.com$/;

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

beforeEach(() => {
  testMux.requests.length = 0;
});

async function failure(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  throw new Error("expected the call to fail");
}

/** `admin.<path>` as the admin, with Mux unconfigured (no token in the env). */
async function callUnconfigured(path: string, input?: unknown) {
  const context = await contextAs(admin);
  return await call(procedureAt(path), input, {
    context: {
      ...context,
      env: {
        ...context.env,
        MUX_TOKEN_ID: undefined,
        MUX_TOKEN_SECRET: undefined,
      },
    },
    path: ["admin", ...path.split(".")],
  });
}

describe("admin.mux.status", () => {
  it("says whether Mux is configured", async () => {
    expect(await callAs(admin, "mux.status")).toEqual({ configured: true });
    expect(await callUnconfigured("mux.status")).toEqual({ configured: false });
  });
});

describe("not configured", () => {
  it("answers INVALID_STATE for uploads, status and assets", async () => {
    expect(await failure(callUnconfigured("mux.createUpload"))).toBe(
      "INVALID_STATE"
    );
    expect(
      await failure(callUnconfigured("mux.uploadStatus", { uploadId: "x" }))
    ).toBe("INVALID_STATE");
    expect(await failure(callUnconfigured("mux.assets", {}))).toBe(
      "INVALID_STATE"
    );
    expect(testMux.requests).toEqual([]);
  });
});

describe("admin.mux.createUpload", () => {
  it("asks Mux for a direct upload with the ruling 4 settings, and audits nothing", async () => {
    const mark = await auditMark();
    const created = await callAs<{ uploadId: string; url: string }>(
      admin,
      "mux.createUpload"
    );
    expect(testMux.requests).toHaveLength(1);
    const [request] = testMux.requests;
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/video/v1/uploads");
    const body = request?.body as {
      new_asset_settings: { passthrough: string };
    };
    expect(body).toEqual({
      cors_origin: "http://localhost:5173",
      new_asset_settings: {
        passthrough: expect.stringMatching(GESTURE_PASSTHROUGH),
        playback_policies: ["public"],
        static_renditions: [{ resolution: "highest" }],
      },
      // The test env is `dev`.
      test: true,
      timeout: 3600,
    });
    expect(created.uploadId).toBe(
      [...testMux.uploads.values()].at(-1)?.id as string
    );
    expect(new URL(created.url).hostname).toMatch(MUX_HOST);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("answers RATE_LIMITED when Mux does (429), not INTERNAL", async () => {
    testMux.failNext(429);
    expect(await failure(callAs(admin, "mux.createUpload"))).toBe(
      "RATE_LIMITED"
    );
  });

  it("sends a fresh passthrough each time", async () => {
    await callAs(admin, "mux.createUpload");
    await callAs(admin, "mux.createUpload");
    const [first, second] = testMux.requests.map(
      (request) =>
        (request.body as { new_asset_settings: { passthrough: string } })
          .new_asset_settings.passthrough
    );
    expect(first).not.toBe(second);
  });
});

async function newUpload(): Promise<string> {
  const { uploadId } = await callAs<{ uploadId: string }>(
    admin,
    "mux.createUpload"
  );
  testMux.requests.length = 0;
  return uploadId;
}

function status(uploadId: string): Promise<MuxUploadProgress> {
  return callAs<MuxUploadProgress>(admin, "mux.uploadStatus", { uploadId });
}

describe("admin.mux.uploadStatus", () => {
  it("follows the Mux API while there is no webhook record", async () => {
    const uploadId = await newUpload();
    expect(await status(uploadId)).toEqual({ upload: "waiting" });
    const asset = testMux.completeUpload(uploadId);
    expect(await status(uploadId)).toEqual({
      asset: { id: asset.id, status: "preparing" },
      upload: "asset_created",
    });
    const ready = testMux.readyAsset(asset.id);
    expect(await status(uploadId)).toEqual({
      asset: { id: asset.id, playbackId: ready.playbackId, status: "ready" },
      upload: "asset_created",
    });
  });

  it("reads a final webhook record from KV without asking Mux", async () => {
    const uploadId = await newUpload();
    await env.KV.put(
      `mux:upload:${uploadId}`,
      JSON.stringify({
        asset: { id: "kv-asset", playbackId: "kv-playback", status: "ready" },
        updatedAt: Date.now(),
        upload: "asset_created",
        uploadId,
      })
    );
    expect(await status(uploadId)).toEqual({
      asset: { id: "kv-asset", playbackId: "kv-playback", status: "ready" },
      upload: "asset_created",
    });
    expect(testMux.requests).toEqual([]);
  });

  it("asks Mux when the KV record is not final yet", async () => {
    const uploadId = await newUpload();
    const asset = testMux.completeUpload(uploadId);
    await env.KV.put(
      `mux:upload:${uploadId}`,
      JSON.stringify({
        asset: { id: asset.id, status: "preparing" },
        updatedAt: Date.now(),
        upload: "asset_created",
        uploadId,
      })
    );
    testMux.errorAsset(asset.id, "Bad file");
    expect(await status(uploadId)).toEqual({
      asset: { id: asset.id, status: "errored" },
      error: "Bad file",
      upload: "asset_created",
    });
    expect(testMux.requests.map((request) => request.path)).toEqual([
      `/video/v1/uploads/${uploadId}`,
      `/video/v1/assets/${asset.id}`,
    ]);
  });

  it("reports an errored upload with Mux's message", async () => {
    const uploadId = await newUpload();
    testMux.errorUpload(uploadId, "Unsupported file");
    expect(await status(uploadId)).toEqual({
      error: "Unsupported file",
      upload: "errored",
    });
  });

  it("is NOT_FOUND for an unknown upload, or one that is not a gesture upload", async () => {
    expect(await failure(status("unknown-upload"))).toBe("NOT_FOUND");
    const other = testMux.uploads.set("render-upload", {
      assetId: null,
      corsOrigin: "*",
      error: null,
      id: "render-upload",
      passthrough: "render:job-1",
      status: "waiting",
      test: false,
      url: "https://direct-uploads.fake.production.mux.com/upload/render-upload",
    });
    expect(other.size).toBeGreaterThan(0);
    expect(await failure(status("render-upload"))).toBe("NOT_FOUND");
  });
});

describe("admin.mux.assets", () => {
  it("hides assets without a public playback id and joins the gestures that use each", async () => {
    testMux.assets.clear();
    const byAsset = testMux.addAsset({ createdAt: 3000 });
    const byPlayback = testMux.addAsset({ createdAt: 2000 });
    testMux.addAsset({ createdAt: 1500, policy: "signed" });
    testMux.addAsset({ createdAt: 1000, policy: null, status: "preparing" });
    const unused = testMux.addAsset({ createdAt: 500 });

    const db = testDb();
    const category = await makeCategory(db, { name: "Mux categorie" });
    const one = await makeGesture(db, {
      muxAssetId: byAsset.id,
      name: "Op asset",
      playbackId: "something-else",
    });
    const two = await makeGesture(db, {
      name: "Op playback",
      playbackId: byPlayback.playbackId as string,
      publishedAt: null,
    });
    expect(category.id).toBeTruthy();

    const page = await callAs<MuxAssetsPage>(admin, "mux.assets", {
      limit: 24,
      page: 1,
    });
    expect(page.items.map((item) => item.id)).toEqual([
      byAsset.id,
      byPlayback.id,
      unused.id,
    ]);
    expect(page.items[0]).toEqual({
      aspectRatio: "3:4",
      createdAt: 3000,
      duration: 4.5,
      id: byAsset.id,
      playbackId: byAsset.playbackId,
      status: "ready",
      usedBy: [{ id: one.id, name: "Op asset" }],
    });
    expect(page.items[1]?.usedBy).toEqual([
      { id: two.id, name: "Op playback" },
    ]);
    expect(page.items[2]?.usedBy).toEqual([]);
    expect(page).toMatchObject({ hasMore: false, page: 1 });
  });

  it("pages with the default size", async () => {
    testMux.assets.clear();
    for (let index = 0; index < 13; index += 1) {
      testMux.addAsset({ createdAt: index });
    }
    const first = await callAs<MuxAssetsPage>(admin, "mux.assets", {});
    const second = await callAs<MuxAssetsPage>(admin, "mux.assets", {
      page: 2,
    });
    expect(first.items).toHaveLength(12);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  it("refuses a page size above 24", async () => {
    expect(await failure(callAs(admin, "mux.assets", { limit: 25 }))).toBe(
      "BAD_REQUEST"
    );
  });
});
