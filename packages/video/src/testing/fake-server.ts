/**
 * The Mux fake over HTTP, for e2e and local runs (Bun only, never in
 * workerd): the API, the upload URLs and the master MP4s on one local
 * origin. Point the site at it with `MUX_API_URL` (plus any
 * `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`: the fake's own, `FAKE_MUX_TOKEN`).
 * After a file is PUT (the browser's gesture upload or the renderer's
 * render upload), the asset becomes ready (or errored, see
 * `/__fake/next-outcome`) after `readyAfterMs`, and the matching signed
 * webhooks are POSTed when `webhook` is set. Turning master access on
 * readies the master after `readyAfterMs` too; its URL
 * (`/master/<assetId>/master.mp4?signature=…`) serves the file PUT to the
 * asset's upload, or else `masterFile` (byte ranges supported, as the
 * renderer's reads need).
 *
 * Control endpoints (e2e and local runs only):
 * - `POST /__fake/next-outcome` `{ "outcome": "ready" | "errored" }`
 * - `POST /__fake/assets` `{ "count": n }` adds ready assets for the picker
 * - `POST /__fake/webhook` `{ "type", "data" }` signs and POSTs one event
 *   to the webhook URL; answers `{ status }` (409 without a webhook)
 * - `GET /__fake/health`
 *
 * Run it: `bun packages/video/src/testing/fake-server.ts` with
 * `FAKE_MUX_PORT` (4010), `FAKE_MUX_PLAYBACK_ID`, `FAKE_MUX_WEBHOOK_URL`,
 * `FAKE_MUX_WEBHOOK_SECRET` and `FAKE_MUX_MASTER_FILE` (by default the
 * render fixture `packages/render/test/fixtures/source-2s.mp4`, when it
 * exists).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "bun";
import {
  createFakeMux,
  type FakeAsset,
  type FakeMux,
  signMuxWebhook,
} from "./fake-mux";

/** The render package's committed source clip (phase 7 ruling 15). */
const DEFAULT_MASTER_FILE = fileURLToPath(
  new URL("../../../render/test/fixtures/source-2s.mp4", import.meta.url)
);

export interface FakeMuxServerOptions {
  /** The bytes a master URL serves for an asset without an uploaded file. */
  masterFile?: string;
  /** A real public sample in e2e, so the player has something to show. */
  playbackId?: string;
  port?: number;
  readyAfterMs?: number;
  webhook?: { secret: string; url: string };
}

/** A Mux webhook event to sign and deliver (`id` and `created_at` are filled in). */
export interface FakeWebhookEvent {
  data: Record<string, unknown>;
  id?: string;
  type: string;
}

export interface FakeMuxServer {
  /**
   * Signs `event` and POSTs it to the webhook URL; the receiver's status,
   * or `null` when there is no webhook or the delivery failed.
   */
  emitWebhook: (event: FakeWebhookEvent) => Promise<number | null>;
  fake: FakeMux;
  stop: () => Promise<void>;
  url: string;
}

const UPLOAD_PUT = /^\/upload\/([^/]+)$/;
const MASTER_ACCESS_PUT = /^\/video\/v1\/assets\/([^/]+)\/master-access$/;
const MASTER_GET = /^\/master\/([^/]+)\/master\.mp4$/;
const RANGE = /^bytes=(\d*)-(\d*)$/;

async function postWebhook(
  webhook: { secret: string; url: string },
  { data, id, type }: FakeWebhookEvent
): Promise<number | null> {
  const body = JSON.stringify({
    created_at: new Date().toISOString(),
    data,
    id: id ?? crypto.randomUUID(),
    object: { id: String(data.id ?? ""), type: type.split(".")[1] ?? "" },
    type,
  });
  try {
    const response = await fetch(webhook.url, {
      body,
      headers: {
        "content-type": "application/json",
        "mux-signature": await signMuxWebhook(body, webhook.secret),
      },
      method: "POST",
    });
    await response.body?.cancel();
    console.log(`[fake-mux] ${type} → ${response.status}`);
    return response.status;
  } catch (error) {
    console.error(`[fake-mux] Failed to deliver ${type}:`, error);
    return null;
  }
}

function assetEventData(asset: FakeAsset): Record<string, unknown> {
  return {
    errors: asset.errors ?? undefined,
    id: asset.id,
    passthrough: asset.passthrough ?? undefined,
    playback_ids:
      asset.playbackId && asset.policy
        ? [{ id: asset.playbackId, policy: asset.policy }]
        : undefined,
    status: asset.status,
    upload_id: asset.uploadId ?? undefined,
  };
}

function decoded(pattern: RegExp, pathname: string): string | null {
  const id = pathname.match(pattern)?.[1];
  return id === undefined ? null : decodeURIComponent(id);
}

/** `bytes` as an MP4, honouring one `Range: bytes=a-b` (206 / 416). */
function serveBytes(request: Request, bytes: Uint8Array): Response {
  const size = bytes.byteLength;
  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": "video/mp4",
  };
  const match = request.headers.get("range")?.match(RANGE);
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (match) {
    const from = match[1] ?? "";
    const to = match[2] ?? "";
    if (from === "") {
      start = Math.max(0, size - Number(to));
    } else {
      start = Number(from);
      end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
    }
    if (start > end || start >= size) {
      return new Response(null, {
        headers: { ...headers, "content-range": `bytes */${size}` },
        status: 416,
      });
    }
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
    status = 206;
  }
  headers["content-length"] = String(end - start + 1);
  return new Response(
    request.method === "HEAD" ? null : bytes.slice(start, end + 1),
    { headers, status }
  );
}

export function startFakeMuxServer(
  options: FakeMuxServerOptions = {}
): FakeMuxServer {
  const { readyAfterMs = 1500, webhook } = options;
  const masterFile = options.masterFile ?? DEFAULT_MASTER_FILE;
  let masterFallback: Uint8Array | null | undefined;
  let nextOutcome: "ready" | "errored" = "ready";
  let fake: FakeMux | undefined;

  const emitWebhook = async (
    event: FakeWebhookEvent
  ): Promise<number | null> =>
    webhook ? await postWebhook(webhook, event) : null;

  /** The fixture, read once; `null` when there is none. */
  function fallbackBytes(): Uint8Array | null {
    if (masterFallback === undefined) {
      masterFallback = existsSync(masterFile)
        ? new Uint8Array(readFileSync(masterFile))
        : null;
    }
    return masterFallback;
  }

  function master(mux: FakeMux, request: Request, assetId: string): Response {
    const asset = mux.assets.get(assetId);
    if (asset?.master?.status !== "ready") {
      return new Response("Not found", { status: 404 });
    }
    const bytes =
      asset.file && asset.file.byteLength > 0 ? asset.file : fallbackBytes();
    if (!bytes) {
      console.warn(
        `[fake-mux] No master file for ${assetId}: set FAKE_MUX_MASTER_FILE`
      );
      return new Response("No master file", { status: 404 });
    }
    return serveBytes(request, bytes);
  }

  async function control(
    mux: FakeMux,
    request: Request,
    pathname: string
  ): Promise<Response | null> {
    if (pathname === "/__fake/health") {
      return Response.json({ ok: true });
    }
    if (request.method !== "POST") {
      return null;
    }
    if (pathname === "/__fake/next-outcome") {
      const body = (await request.json()) as { outcome?: string };
      nextOutcome = body.outcome === "errored" ? "errored" : "ready";
      return Response.json({ outcome: nextOutcome });
    }
    if (pathname === "/__fake/assets") {
      const body = (await request.json()) as { count?: number };
      const added = Array.from({ length: body.count ?? 1 }, (_, index) =>
        mux.addAsset({ createdAt: Date.now() - index * 1000 })
      );
      return Response.json({ added: added.length });
    }
    if (pathname === "/__fake/webhook") {
      if (!webhook) {
        return Response.json({ error: "no webhook URL" }, { status: 409 });
      }
      const event = (await request.json()) as FakeWebhookEvent;
      return Response.json({ status: await emitWebhook(event) });
    }
    return null;
  }

  const server = serve({
    fetch: async (request) => {
      const current = fake;
      if (!current) {
        return new Response("Starting", { status: 503 });
      }
      const url = new URL(request.url);
      if (url.pathname.startsWith("/__fake/")) {
        const answer = await control(current, request, url.pathname);
        if (answer) {
          return answer;
        }
      }
      const masterId = decoded(MASTER_GET, url.pathname);
      if (
        masterId !== null &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        return master(current, request, masterId);
      }
      const response = await current.fetch(request);
      if (request.method === "PUT" && response.ok) {
        const uploadId = decoded(UPLOAD_PUT, url.pathname);
        if (uploadId !== null) {
          settle(current, uploadId);
        }
        const assetId = decoded(MASTER_ACCESS_PUT, url.pathname);
        if (assetId !== null) {
          prepareMaster(current, assetId);
        }
      }
      return response;
    },
    port: options.port ?? 0,
  });

  const origin = `http://localhost:${server.port}`;
  fake = createFakeMux({
    apiUrl: origin,
    masterOrigin: origin,
    uploadOrigin: origin,
    ...(options.playbackId ? { playbackId: options.playbackId } : {}),
  });

  /** Master access turned on: the master is ready `readyAfterMs` later. */
  function prepareMaster(mux: FakeMux, assetId: string): void {
    setTimeout(() => {
      const asset = mux.assets.get(assetId);
      if (asset?.masterAccess === "temporary") {
        mux.readyMaster(assetId);
      }
    }, readyAfterMs);
  }

  function settle(mux: FakeMux, uploadId: string): void {
    const upload = mux.uploads.get(uploadId);
    const assetId = upload?.assetId;
    if (!(upload && assetId)) {
      return;
    }
    const outcome = nextOutcome;
    nextOutcome = "ready";
    emitWebhook({
      data: {
        asset_id: assetId,
        id: uploadId,
        new_asset_settings: { passthrough: upload.passthrough ?? undefined },
        status: "asset_created",
      },
      type: "video.upload.asset_created",
    }).catch(() => undefined);
    setTimeout(() => {
      const asset =
        outcome === "errored"
          ? mux.errorAsset(assetId)
          : mux.readyAsset(assetId);
      emitWebhook({
        data: assetEventData(asset),
        type:
          outcome === "errored" ? "video.asset.errored" : "video.asset.ready",
      }).catch(() => undefined);
    }, readyAfterMs);
  }

  return {
    emitWebhook,
    fake,
    stop: async () => {
      await server.stop(true);
    },
    url: origin,
  };
}

if (import.meta.main) {
  const webhookUrl = process.env.FAKE_MUX_WEBHOOK_URL;
  const webhookSecret = process.env.FAKE_MUX_WEBHOOK_SECRET;
  const playbackId = process.env.FAKE_MUX_PLAYBACK_ID;
  const masterFile = process.env.FAKE_MUX_MASTER_FILE;
  const { url } = startFakeMuxServer({
    port: Number(process.env.FAKE_MUX_PORT ?? 4010),
    ...(masterFile ? { masterFile } : {}),
    ...(playbackId ? { playbackId } : {}),
    ...(webhookUrl && webhookSecret
      ? { webhook: { secret: webhookSecret, url: webhookUrl } }
      : {}),
  });
  console.log(`[fake-mux] Listening on ${url}`);
}
