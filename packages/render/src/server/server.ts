/**
 * The render server (phase 7 ruling 7): `GET /health`, `POST /render` and
 * `GET /assets/<renderJobId>/logo`. It is pure: Remotion, the upload and
 * the metadata reader are ports (`main.ts` wires the real ones, the tests
 * fakes). One render slot, keyed by `renderJobId`: a new request for the
 * same job cancels the running one and starts again with its own upload
 * URL; another job while one runs is `busy`.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RenderServerEnv } from "@smog/config/env/render";
import { readCappedBody } from "@smog/utils";
import {
  type SponsoredVideoProps,
  sponsoredVideoPropsSchema,
} from "../compositions/props";
import {
  type RenderRequest,
  type RenderResult,
  renderRequestSchema,
} from "../contract";
import type { SourceMetadata } from "../metadata";
import {
  describeError,
  failureResponse,
  RenderServerError,
  RenderSupersededError,
  toRenderServerError,
} from "./errors";
import {
  createLogoAssets,
  decodeLogoDataUrl,
  isLoopback,
  logoAssetUrl,
  matchLogoAssetPath,
} from "./logo-asset";
import type { RenderPort } from "./render";
import type { UploadPort } from "./upload";

/** The request body cap: a 2 MiB logo is about 2.7 MiB of base64. */
export const RENDER_BODY_MAX_BYTES = 4 * 1024 * 1024;

const MUX_HOST = /\.mux\.com$/;

export interface MetadataPort {
  read: (url: string) => Promise<SourceMetadata>;
}

/** `[render]` lines; never a URL (callers pass ids, codes and sizes). */
export interface RenderLog {
  error: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
}

export interface RenderServerOptions {
  env: Pick<RenderServerEnv, "PORT" | "RENDER_ALLOW_HTTP" | "RENDER_TMP_DIR">;
  /** What `GET /health` reports besides `ok`. */
  health: { browser: string; version: string };
  log: RenderLog;
  metadata: MetadataPort;
  now?: () => number;
  renderer: RenderPort;
  uploader: UploadPort;
}

/** What the caller knows about the connection (`Bun.Server.requestIP`). */
interface RequestInfo {
  remoteAddress?: string | null;
}

export interface RenderServer {
  /** Refuses new renders and resolves once the running one has settled. */
  drain: () => Promise<void>;
  fetch: (request: Request, info?: RequestInfo) => Promise<Response>;
}

interface Slot {
  controller: AbortController;
  /** Called once the run has settled (resolves `settled`). */
  release: () => void;
  renderJobId: string;
  /** Resolves once the run's temp files are gone. */
  settled: Promise<void>;
}

function invalid(message: string): RenderServerError {
  return new RenderServerError("invalidInput", message);
}

/** The URL rules the schema cannot know: https, and a Mux upload host. */
function checkUrls(request: RenderRequest, allowHttp: boolean): void {
  if (allowHttp) {
    return;
  }
  for (const field of ["sourceUrl", "uploadUrl"] as const) {
    if (new URL(request[field]).protocol !== "https:") {
      throw invalid(`${field}: must be https`);
    }
  }
  if (!MUX_HOST.test(new URL(request.uploadUrl).hostname)) {
    throw invalid("uploadUrl: must be a *.mux.com host");
  }
}

async function parseRequest(
  request: Request,
  allowHttp: boolean
): Promise<RenderRequest> {
  const body = await readCappedBody(request, RENDER_BODY_MAX_BYTES);
  if (!body.ok) {
    throw invalid(
      body.status === 413
        ? `the body is larger than ${RENDER_BODY_MAX_BYTES} bytes`
        : "the body could not be read"
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body.bytes));
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: the cause is the third argument (the code comes first).
    throw new RenderServerError("invalidInput", "the body is not JSON", {
      cause: error,
    });
  }
  const parsed = renderRequestSchema.safeParse(payload);
  if (!parsed.success) {
    // Paths and Zod's own messages only: never the values.
    throw invalid(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ")
    );
  }
  checkUrls(parsed.data, allowHttp);
  return parsed.data;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

const NOT_FOUND = { message: "not found", ok: false };

export function createRenderServer(options: RenderServerOptions): RenderServer {
  const { env, log, metadata, renderer, uploader } = options;
  const now = options.now ?? Date.now;
  const logos = createLogoAssets();
  let slot: Slot | null = null;
  let draining = false;
  let attempts = 0;

  async function run(
    request: RenderRequest,
    controller: AbortController,
    dir: string
  ): Promise<RenderResult> {
    const started = now();
    const { renderJobId } = request;
    const { signal } = controller;
    const checkpoint = (): void => {
      if (signal.aborted) {
        throw signal.reason;
      }
    };
    await mkdir(dir, { recursive: true });

    let logoUrl: string | null = null;
    if (request.logoDataUrl) {
      const logo = decodeLogoDataUrl(request.logoDataUrl);
      const path = join(dir, "logo");
      await writeFile(path, logo.bytes);
      logos.set(renderJobId, { contentType: logo.contentType, path });
      logoUrl = logoAssetUrl(env.PORT, renderJobId);
    }

    const source = await metadata.read(request.sourceUrl);
    checkpoint();
    log.info("source read", {
      durationInFrames: source.durationInFrames,
      height: source.height,
      renderJobId,
      width: source.width,
    });

    const props = sponsoredVideoPropsSchema.safeParse({
      background: { kind: "video", src: request.sourceUrl },
      displayName: request.input.displayName,
      durationInFrames: source.durationInFrames,
      height: source.height,
      logoUrl,
      width: source.width,
    } satisfies SponsoredVideoProps);
    if (!props.success) {
      throw invalid(
        `the composition's props: ${props.error.issues
          .map((issue) => issue.path.join("."))
          .join(", ")}`
      );
    }

    const outputPath = join(dir, "out.mp4");
    const { frames } = await renderer.render({
      cancelSignal: signal,
      outputPath,
      props: props.data,
    });
    checkpoint();
    const rendered = now();
    log.info("rendered", { frames, ms: rendered - started, renderJobId });

    const { bytes } = await uploader.upload({
      filePath: outputPath,
      signal,
      url: request.uploadUrl,
    });
    checkpoint();
    const ms = Math.max(0, Math.round(now() - started));
    log.info("uploaded", {
      bytes,
      ms,
      renderJobId,
      uploadMs: now() - rendered,
    });
    return {
      bytes,
      frames,
      height: props.data.height,
      ms,
      ok: true,
      width: props.data.width,
    };
  }

  /** Claims the slot, cancelling this job's running attempt first. */
  async function claim(renderJobId: string): Promise<Slot | null> {
    for (;;) {
      if (draining) {
        return null;
      }
      const current: Slot | null = slot;
      if (current === null) {
        let release = (): void => undefined;
        const settled = new Promise<void>((resolve) => {
          release = resolve;
        });
        const claimed: Slot = {
          controller: new AbortController(),
          release,
          renderJobId,
          settled,
        };
        slot = claimed;
        return claimed;
      }
      if (current.renderJobId !== renderJobId) {
        return null;
      }
      log.info("replacing the running render of the same job", {
        renderJobId,
      });
      current.controller.abort(new RenderSupersededError());
      // biome-ignore lint/performance/noAwaitInLoops: wait for the old attempt's cleanup, then try again.
      await current.settled;
    }
  }

  async function handleRender(request: Request): Promise<Response> {
    let parsed: RenderRequest;
    try {
      parsed = await parseRequest(request, env.RENDER_ALLOW_HTTP);
    } catch (error) {
      const failure = toRenderServerError(error);
      log.warn("refused a request", {
        code: failure.code,
        message: failure.message,
      });
      return failureResponse(failure);
    }
    const { renderJobId } = parsed;
    const claimed = await claim(renderJobId);
    if (!claimed) {
      const running = slot?.renderJobId ?? null;
      if (draining) {
        log.info("refused a render while shutting down", { renderJobId });
      } else {
        // One instance per job: another job here is an anomaly.
        log.warn("busy with another job", { renderJobId, running });
      }
      return failureResponse(
        new RenderServerError(
          "busy",
          draining
            ? "the renderer is shutting down"
            : "the renderer is busy with another job"
        )
      );
    }

    attempts += 1;
    const dir = join(env.RENDER_TMP_DIR, `${renderJobId}-${attempts}`);
    log.info("render started", { attempt: attempts, renderJobId });
    try {
      return json(await run(parsed, claimed.controller, dir));
    } catch (error) {
      const failure = toRenderServerError(
        claimed.controller.signal.aborted
          ? claimed.controller.signal.reason
          : error
      );
      log.error("render failed", {
        code: failure.code,
        message: failure.message,
        renderJobId,
      });
      if (!claimed.controller.signal.aborted && error !== failure) {
        log.error("render failure detail", {
          detail: describeError(error),
          renderJobId,
        });
      }
      return failureResponse(failure);
    } finally {
      logos.remove(renderJobId, join(dir, "logo"));
      await rm(dir, { force: true, recursive: true }).catch((error) => {
        log.error("failed to delete the temp files", {
          detail: describeError(error),
          renderJobId,
        });
      });
      if (slot === claimed) {
        slot = null;
      }
      claimed.release();
    }
  }

  function handleLogo(
    renderJobId: string,
    info: RequestInfo | undefined
  ): Response {
    const asset = isLoopback(info?.remoteAddress)
      ? logos.get(renderJobId)
      : null;
    if (!asset) {
      return json(NOT_FOUND, 404);
    }
    return new Response(Bun.file(asset.path), {
      headers: {
        "cache-control": "no-store",
        "content-type": asset.contentType,
      },
    });
  }

  return {
    drain(): Promise<void> {
      draining = true;
      return slot?.settled ?? Promise.resolve();
    },
    fetch(request: Request, info?: RequestInfo): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (pathname === "/health") {
        return Promise.resolve(
          request.method === "GET"
            ? json({ ok: true, ...options.health })
            : json({ message: "method not allowed", ok: false }, 405)
        );
      }
      if (pathname === "/render") {
        return request.method === "POST"
          ? handleRender(request)
          : Promise.resolve(
              json({ message: "method not allowed", ok: false }, 405)
            );
      }
      const logoJob = matchLogoAssetPath(pathname);
      if (logoJob !== null && request.method === "GET") {
        return Promise.resolve(handleLogo(logoJob, info));
      }
      return Promise.resolve(json(NOT_FOUND, 404));
    },
  };
}
