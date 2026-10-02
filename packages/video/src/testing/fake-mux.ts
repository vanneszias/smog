import { createMux, type Mux, type MuxFetch } from "../client";
import { muxSignature } from "../webhooks";

/**
 * An in-memory Mux Video API: a `fetch` that answers the endpoints
 * `@smog/video` calls (create/get upload, get/list assets) plus the
 * browser's `PUT` to the upload URL, so the real client code runs against
 * it. No network. The Bun fake server (`./fake-server`) serves the same
 * handler over HTTP for e2e.
 */

interface FakeRequest {
  body?: unknown;
  method: string;
  path: string;
}

export interface FakeUpload {
  assetId: string | null;
  corsOrigin: string;
  error: { message: string; type: string } | null;
  id: string;
  passthrough: string | null;
  status: "waiting" | "asset_created" | "errored" | "cancelled" | "timed_out";
  test: boolean;
  url: string;
}

export interface FakeAsset {
  aspectRatio: string | null;
  /** Milliseconds since the epoch. */
  createdAt: number;
  duration: number | null;
  errors: { messages: string[]; type: string } | null;
  id: string;
  passthrough: string | null;
  playbackId: string | null;
  /** The playback id's policy; `null` for no playback id at all. */
  policy: "public" | "signed" | null;
  status: "preparing" | "ready" | "errored";
  uploadId: string | null;
}

export interface FakeMuxOptions {
  /** Where the client points (`MUX_API_URL`). */
  apiUrl?: string;
  /** The playback id ready assets get (a real public sample in e2e); random otherwise. */
  playbackId?: string;
  /** The origin of the upload URLs; a `*.mux.com` host by default. */
  uploadOrigin?: string;
}

export interface FakeMux {
  addAsset: (asset?: Partial<FakeAsset>) => FakeAsset;
  readonly apiUrl: string;
  readonly assets: Map<string, FakeAsset>;
  /** The upload received its file: `asset_created`, with a preparing asset. */
  completeUpload: (uploadId: string) => FakeAsset;
  errorAsset: (assetId: string, message?: string) => FakeAsset;
  errorUpload: (uploadId: string, message?: string) => FakeUpload;
  /** Answers like Mux (API requests need the basic auth; uploads do not). */
  fetch: MuxFetch;
  /** A client wired to this fake. */
  readonly mux: Mux;
  readyAsset: (assetId: string) => FakeAsset;
  /** Every API request (not the upload PUTs), in order, with its JSON body. */
  readonly requests: FakeRequest[];
  readonly uploads: Map<string, FakeUpload>;
}

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomId(length = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

const TOKEN = { id: "fake-token-id", secret: "fake-token-secret" };
const AUTHORIZATION = `Basic ${btoa(`${TOKEN.id}:${TOKEN.secret}`)}`;

const UPLOAD_PATH = /^\/video\/v1\/uploads\/([^/]+)$/;
const ASSET_PATH = /^\/video\/v1\/assets\/([^/]+)$/;
const PUT_PATH = /^\/upload\/([^/]+)$/;

/** The decoded id a path pattern captures, or `null`. */
function idIn(pattern: RegExp, pathname: string): string | null {
  // The patterns are anchored: replacing the whole path leaves the capture.
  return pattern.test(pathname)
    ? decodeURIComponent(pathname.replace(pattern, "$1"))
    : null;
}

function json(
  data: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response {
  return Response.json(data, { headers, status });
}

function notFound(): Response {
  return json({ error: { messages: ["Not found"], type: "not_found" } }, 404);
}

function uploadJson(upload: FakeUpload) {
  return {
    asset_id: upload.assetId ?? undefined,
    cors_origin: upload.corsOrigin,
    error: upload.error ?? undefined,
    id: upload.id,
    new_asset_settings: {
      passthrough: upload.passthrough ?? undefined,
      playback_policies: ["public"],
    },
    status: upload.status,
    test: upload.test,
    timeout: 3600,
    url: upload.status === "waiting" ? upload.url : undefined,
  };
}

function assetJson(asset: FakeAsset) {
  return {
    aspect_ratio: asset.aspectRatio ?? undefined,
    created_at: String(Math.floor(asset.createdAt / 1000)),
    duration: asset.duration ?? undefined,
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

/** The Mux upload URL's CORS: only the upload's `cors_origin`. */
function corsHeaders(
  upload: FakeUpload | undefined,
  origin: string | null
): Record<string, string> {
  if (!(upload && origin && origin === upload.corsOrigin)) {
    return {};
  }
  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "PUT, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "600",
  };
}

export function createFakeMux(options: FakeMuxOptions = {}): FakeMux {
  const apiUrl = options.apiUrl ?? "https://api.mux.test";
  const uploadOrigin =
    options.uploadOrigin ?? "https://direct-uploads.fake.production.mux.com";
  const uploads = new Map<string, FakeUpload>();
  const assets = new Map<string, FakeAsset>();
  const requests: FakeRequest[] = [];

  function addAsset(asset: Partial<FakeAsset> = {}): FakeAsset {
    const status = asset.status ?? "ready";
    const policy = asset.policy === undefined ? "public" : asset.policy;
    const created: FakeAsset = {
      aspectRatio: "3:4",
      createdAt: Date.now(),
      duration: 4.5,
      errors: null,
      id: randomId(),
      passthrough: null,
      playbackId: policy ? (options.playbackId ?? randomId(32)) : null,
      policy,
      uploadId: null,
      ...asset,
      status,
    };
    assets.set(created.id, created);
    return created;
  }

  function mustUpload(id: string): FakeUpload {
    const upload = uploads.get(id);
    if (!upload) {
      throw new Error(`[fake-mux] No upload ${id}`);
    }
    return upload;
  }

  function mustAsset(id: string): FakeAsset {
    const asset = assets.get(id);
    if (!asset) {
      throw new Error(`[fake-mux] No asset ${id}`);
    }
    return asset;
  }

  function completeUpload(uploadId: string): FakeAsset {
    const upload = mustUpload(uploadId);
    const asset = addAsset({
      aspectRatio: null,
      createdAt: Date.now(),
      duration: null,
      passthrough: upload.passthrough,
      playbackId: null,
      policy: null,
      status: "preparing",
      uploadId,
    });
    upload.status = "asset_created";
    upload.assetId = asset.id;
    return asset;
  }

  function readyAsset(assetId: string): FakeAsset {
    const asset = mustAsset(assetId);
    asset.status = "ready";
    asset.policy = "public";
    asset.playbackId ??= options.playbackId ?? randomId(32);
    asset.aspectRatio ??= "3:4";
    asset.duration ??= 4.5;
    return asset;
  }

  function errorAsset(
    assetId: string,
    message = "Invalid input file"
  ): FakeAsset {
    const asset = mustAsset(assetId);
    asset.status = "errored";
    asset.errors = { messages: [message], type: "invalid_input" };
    return asset;
  }

  function errorUpload(
    uploadId: string,
    message = "Upload failed"
  ): FakeUpload {
    const upload = mustUpload(uploadId);
    upload.status = "errored";
    upload.error = { message, type: "invalid_input" };
    return upload;
  }

  function createUploadRoute(body: unknown): Response {
    const settings = body as {
      cors_origin: string;
      new_asset_settings?: { passthrough?: string };
      test?: boolean;
    };
    const id = randomId();
    const upload: FakeUpload = {
      assetId: null,
      corsOrigin: settings.cors_origin,
      error: null,
      id,
      passthrough: settings.new_asset_settings?.passthrough ?? null,
      status: "waiting",
      test: settings.test ?? false,
      url: `${uploadOrigin}/upload/${id}?signature=fake`,
    };
    uploads.set(id, upload);
    return json({ data: uploadJson(upload) }, 201);
  }

  function listAssetsRoute(url: URL): Response {
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const page = Number(url.searchParams.get("page") ?? 1);
    const sorted = [...assets.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const data = sorted.slice((page - 1) * limit, page * limit).map(assetJson);
    return json({ data });
  }

  function getRoute(pathname: string): Response {
    const uploadId = idIn(UPLOAD_PATH, pathname);
    if (uploadId !== null) {
      const upload = uploads.get(uploadId);
      return upload ? json({ data: uploadJson(upload) }) : notFound();
    }
    const assetId = idIn(ASSET_PATH, pathname);
    if (assetId !== null) {
      const asset = assets.get(assetId);
      return asset ? json({ data: assetJson(asset) }) : notFound();
    }
    return notFound();
  }

  async function api(request: Request, path: string): Promise<Response> {
    const body =
      request.method === "POST"
        ? ((await request.json()) as unknown)
        : undefined;
    requests.push({
      method: request.method,
      path,
      ...(body === undefined ? {} : { body }),
    });
    if (request.headers.get("authorization") !== AUTHORIZATION) {
      return json(
        { error: { messages: ["Unauthorized"], type: "unauthorized" } },
        401
      );
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/video/v1/uploads") {
      return createUploadRoute(body);
    }
    if (request.method !== "GET") {
      return notFound();
    }
    return url.pathname === "/video/v1/assets"
      ? listAssetsRoute(url)
      : getRoute(url.pathname);
  }

  /** The browser's PUT of the file to the signed upload URL. */
  async function put(request: Request, uploadId: string): Promise<Response> {
    const upload = uploads.get(uploadId);
    const cors = corsHeaders(upload, request.headers.get("origin"));
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors, status: upload ? 204 : 404 });
    }
    if (!upload || request.method !== "PUT") {
      return new Response("Not found", { headers: cors, status: 404 });
    }
    await request.arrayBuffer();
    if (upload.status !== "waiting") {
      return new Response("Upload is closed", { headers: cors, status: 410 });
    }
    completeUpload(uploadId);
    return new Response(null, { headers: cors, status: 200 });
  }

  const handle = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const putId = idIn(PUT_PATH, url.pathname);
    if (url.origin === new URL(uploadOrigin).origin && putId !== null) {
      return await put(request, putId);
    }
    return await api(request, `${url.pathname}${url.search}`);
  };

  const mux = createMux(
    {
      MUX_API_URL: apiUrl,
      MUX_TOKEN_ID: TOKEN.id,
      MUX_TOKEN_SECRET: TOKEN.secret,
    },
    { fetch: handle }
  );
  if (!mux) {
    throw new Error("[fake-mux] Failed to build the client");
  }

  return {
    addAsset,
    apiUrl,
    assets,
    completeUpload,
    errorAsset,
    errorUpload,
    fetch: handle,
    mux,
    readyAsset,
    requests,
    uploads,
  };
}

/** The env the fake accepts (`createMux(env)` against `fake.fetch`). */
export const FAKE_MUX_TOKEN = TOKEN;

/** A `Mux-Signature` header value for `rawBody`, as Mux signs it. */
export async function signMuxWebhook(
  rawBody: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  return `t=${timestamp},v1=${await muxSignature(rawBody, secret, timestamp)}`;
}
