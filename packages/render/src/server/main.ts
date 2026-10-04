/**
 * The render server's entry (phase 7 ruling 7): the image's `CMD`, and
 * `bun -F @smog/render serve` for `RENDER_MODE=local`. It validates the env
 * with `@smog/config/env/render`, makes sure the bundle and the browser are
 * there, wires the real ports into `createRenderServer` and serves it with
 * `Bun.serve`. `SIGTERM` lets a running render finish, then exits.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseRenderServerEnv } from "@smog/config/env/render";
import { VERSION } from "remotion/version";
import { readSourceMetadata } from "../metadata";
import { describeBrowser, ensureRenderBrowser } from "./ensure-browser";
import { describeError } from "./errors";
import { createRemotionRenderer } from "./render";
import { createRenderServer, type RenderLog } from "./server";
import { createFetchUploader } from "./upload";

function line(message: string, data?: Record<string, unknown>): string {
  return data
    ? `[render] ${message} ${JSON.stringify(data)}`
    : `[render] ${message}`;
}

const log: RenderLog = {
  error: (message, data) => console.error(line(message, data)),
  info: (message, data) => console.log(line(message, data)),
  warn: (message, data) => console.warn(line(message, data)),
};

async function main(): Promise<void> {
  const env = parseRenderServerEnv(process.env);

  // `serve` builds the bundle once; the image has it from its build stage
  // (and no `@remotion/bundler`, so it is imported only when needed).
  if (!existsSync(join(env.RENDER_BUNDLE_DIR, "index.html"))) {
    log.info("no bundle yet: building it", { dir: env.RENDER_BUNDLE_DIR });
    const { buildBundle } = await import("./bundle");
    await buildBundle(env.RENDER_BUNDLE_DIR);
  }

  const browserExecutable = env.RENDER_BROWSER_EXECUTABLE ?? null;
  const browser = describeBrowser(await ensureRenderBrowser(browserExecutable));

  const app = createRenderServer({
    env,
    health: { browser, version: `remotion ${VERSION}` },
    log,
    metadata: { read: (url) => readSourceMetadata(url) },
    renderer: createRemotionRenderer({
      browserExecutable,
      licenseKey: env.REMOTION_LICENSE_KEY ?? null,
      log,
      serveUrl: env.RENDER_BUNDLE_DIR,
    }),
    uploader: createFetchUploader(),
  });

  // Local mode listens on loopback only; the Container is reached through
  // its Durable Object, from outside the container's own loopback.
  const hostname = env.RENDER_ENVIRONMENT === "dev" ? "127.0.0.1" : "0.0.0.0";
  const server = Bun.serve({
    fetch: (request, bun) =>
      app.fetch(request, { remoteAddress: bun.requestIP(request)?.address }),
    hostname,
    // A render answers after minutes: no idle cut-off.
    idleTimeout: 0,
    port: env.PORT,
  });
  log.info("listening", {
    browser,
    environment: env.RENDER_ENVIRONMENT,
    hostname,
    port: server.port,
  });

  process.once("SIGTERM", async () => {
    log.info("SIGTERM: finishing the running render, then exiting");
    await app.drain();
    await server.stop();
    process.exit(0);
  });
}

try {
  await main();
} catch (error) {
  log.error("Failed to start", { detail: describeError(error) });
  process.exit(1);
}
