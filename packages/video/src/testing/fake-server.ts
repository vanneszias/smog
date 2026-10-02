/**
 * The Mux fake over HTTP, for e2e (Bun only, never in workerd): the API
 * and the upload URLs on one local origin. Point the site at it with
 * `MUX_API_URL` (plus any `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`: the fake's
 * own, `FAKE_MUX_TOKEN`). After a file is PUT, the asset becomes ready
 * (or errored, see `/__fake/next-outcome`) after `readyAfterMs`, and the
 * matching signed webhooks are POSTed when `webhook` is set.
 *
 * Control endpoints (e2e only):
 * - `POST /__fake/next-outcome` `{ "outcome": "ready" | "errored" }`
 * - `POST /__fake/assets` `{ "count": n }` adds ready assets for the picker
 * - `GET /__fake/health`
 *
 * Run it: `bun packages/video/src/testing/fake-server.ts` with
 * `FAKE_MUX_PORT` (4010), `FAKE_MUX_PLAYBACK_ID`, `FAKE_MUX_WEBHOOK_URL`
 * and `FAKE_MUX_WEBHOOK_SECRET`.
 */
import { serve } from "bun";
import {
  createFakeMux,
  type FakeAsset,
  type FakeMux,
  signMuxWebhook,
} from "./fake-mux";

export interface FakeMuxServerOptions {
  /** A real public sample in e2e, so the player has something to show. */
  playbackId?: string;
  port?: number;
  readyAfterMs?: number;
  webhook?: { secret: string; url: string };
}

export interface FakeMuxServer {
  fake: FakeMux;
  stop: () => Promise<void>;
  url: string;
}

const UPLOAD_PUT = /^\/upload\/([^/]+)$/;

async function postWebhook(
  webhook: { secret: string; url: string },
  type: string,
  data: unknown
): Promise<void> {
  const body = JSON.stringify({
    created_at: new Date().toISOString(),
    data,
    id: crypto.randomUUID(),
    object: {
      id: String((data as { id?: unknown }).id ?? ""),
      type: type.split(".")[1] ?? "",
    },
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
    console.log(`[fake-mux] ${type} → ${response.status}`);
  } catch (error) {
    console.error(`[fake-mux] Failed to deliver ${type}:`, error);
  }
}

function assetEventData(asset: FakeAsset) {
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

export function startFakeMuxServer(
  options: FakeMuxServerOptions = {}
): FakeMuxServer {
  const { readyAfterMs = 1500, webhook } = options;
  let nextOutcome: "ready" | "errored" = "ready";
  let fake: FakeMux | undefined;

  const server = serve({
    fetch: async (request) => {
      const current = fake;
      if (!current) {
        return new Response("Starting", { status: 503 });
      }
      const url = new URL(request.url);
      if (url.pathname === "/__fake/health") {
        return Response.json({ ok: true });
      }
      if (
        url.pathname === "/__fake/next-outcome" &&
        request.method === "POST"
      ) {
        const body = (await request.json()) as { outcome?: string };
        nextOutcome = body.outcome === "errored" ? "errored" : "ready";
        return Response.json({ outcome: nextOutcome });
      }
      if (url.pathname === "/__fake/assets" && request.method === "POST") {
        const body = (await request.json()) as { count?: number };
        const added = Array.from({ length: body.count ?? 1 }, (_, index) =>
          current.addAsset({ createdAt: Date.now() - index * 1000 })
        );
        return Response.json({ added: added.length });
      }
      const response = await current.fetch(request);
      const match = UPLOAD_PUT.exec(url.pathname);
      if (request.method === "PUT" && match && response.ok) {
        settle(current, decodeURIComponent(match[1] ?? ""));
      }
      return response;
    },
    port: options.port ?? 0,
  });

  const origin = `http://localhost:${server.port}`;
  fake = createFakeMux({
    apiUrl: origin,
    uploadOrigin: origin,
    ...(options.playbackId ? { playbackId: options.playbackId } : {}),
  });

  function settle(mux: FakeMux, uploadId: string): void {
    const upload = mux.uploads.get(uploadId);
    const assetId = upload?.assetId;
    if (!(upload && assetId)) {
      return;
    }
    const outcome = nextOutcome;
    nextOutcome = "ready";
    if (webhook) {
      postWebhook(webhook, "video.upload.asset_created", {
        asset_id: assetId,
        id: uploadId,
        new_asset_settings: { passthrough: upload.passthrough ?? undefined },
        status: "asset_created",
      }).catch(() => undefined);
    }
    setTimeout(() => {
      const asset =
        outcome === "errored"
          ? mux.errorAsset(assetId)
          : mux.readyAsset(assetId);
      if (webhook) {
        postWebhook(
          webhook,
          outcome === "errored" ? "video.asset.errored" : "video.asset.ready",
          assetEventData(asset)
        ).catch(() => undefined);
      }
    }, readyAfterMs);
  }

  return {
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
  const { url } = startFakeMuxServer({
    port: Number(process.env.FAKE_MUX_PORT ?? 4010),
    ...(playbackId ? { playbackId } : {}),
    ...(webhookUrl && webhookSecret
      ? { webhook: { secret: webhookSecret, url: webhookUrl } }
      : {}),
  });
  console.log(`[fake-mux] Listening on ${url}`);
}
