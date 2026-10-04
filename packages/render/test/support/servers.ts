/**
 * Local HTTP servers for the render tests (phase 7 ruling 16): a file
 * server with byte ranges (the source, as Mux serves it) and an upload
 * sink that keeps what is `PUT` to it (Mux's direct upload). They run on
 * the host, so no test file ships in the runtime image.
 */
import { file as bunFile, type Server, serve } from "bun";

const RANGE = /^bytes=(\d*)-(\d*)$/;

export interface LocalServer {
  stop: () => Promise<void>;
  url: string;
}

/** Serves `files` (path → local file) with `Range` support, on loopback. */
export function serveFiles(files: Record<string, string>): LocalServer {
  const server: Server<undefined> = serve({
    async fetch(request) {
      const path = files[new URL(request.url).pathname];
      if (!path) {
        return new Response("not found", { status: 404 });
      }
      const body = bunFile(path);
      const { size } = body;
      const headers = {
        "accept-ranges": "bytes",
        "content-type": body.type || "application/octet-stream",
      };
      const range = (request.headers.get("range") ?? "").match(RANGE);
      if (range === null) {
        return new Response(request.method === "HEAD" ? null : body, {
          headers: { ...headers, "content-length": String(size) },
        });
      }
      const start = range[1]
        ? Number(range[1])
        : Math.max(0, size - Number(range[2]));
      const end =
        range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, {
          headers: { "content-range": `bytes */${size}` },
          status: 416,
        });
      }
      const slice = new Uint8Array(
        await body.slice(start, end + 1).arrayBuffer()
      );
      return new Response(request.method === "HEAD" ? null : slice, {
        headers: {
          ...headers,
          "content-length": String(slice.byteLength),
          "content-range": `bytes ${start}-${end}/${size}`,
        },
        status: 206,
      });
    },
    hostname: "127.0.0.1",
    port: 0,
  });
  return {
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}`,
  };
}

interface ReceivedUpload {
  body: Uint8Array;
  contentLength: string | null;
  contentType: string | null;
  method: string;
}

export interface UploadSink extends LocalServer {
  /** Resolves with the first upload received. */
  next: () => Promise<ReceivedUpload>;
  uploads: ReceivedUpload[];
}

/** Accepts `PUT`s and keeps their bodies, as a Mux direct upload would. */
export function serveUploadSink(): UploadSink {
  const uploads: ReceivedUpload[] = [];
  const waiting: ((upload: ReceivedUpload) => void)[] = [];
  const server: Server<undefined> = serve({
    async fetch(request) {
      const upload: ReceivedUpload = {
        body: new Uint8Array(await request.arrayBuffer()),
        contentLength: request.headers.get("content-length"),
        contentType: request.headers.get("content-type"),
        method: request.method,
      };
      uploads.push(upload);
      for (const resolve of waiting.splice(0)) {
        resolve(upload);
      }
      return new Response(null, { status: 200 });
    },
    hostname: "127.0.0.1",
    // A real render's file is a few MB.
    maxRequestBodySize: 512 * 1024 * 1024,
    port: 0,
  });
  return {
    next: () => {
      const [first] = uploads;
      return first
        ? Promise.resolve(first)
        : new Promise((resolve) => {
            waiting.push(resolve);
          });
    },
    stop: () => server.stop(true),
    uploads,
    url: `http://127.0.0.1:${server.port}`,
  };
}
