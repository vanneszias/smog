/**
 * The local render loop (phase 7 task 9): one paid sponsorship rendered for
 * real, end to end, on this machine. Opt-in and never part of `bun run
 * test` or `release:check`, because it needs Chrome (Remotion's renderer).
 *
 *   RENDER_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
 *     bun -F @smog/site render:local-loop
 *
 * It starts, each on its own port:
 * - the Mux fake (`@smog/video/testing/server`) in this process, so the
 *   uploaded MP4 can be read back; one ready asset carries the gesture's
 *   playback id, and its master serves the render fixture
 *   (`packages/render/test/fixtures/source-2s.mp4`);
 * - the render server (`packages/render/src/server/main.ts`) on 3002, the
 *   dev Worker's `RENDER_LOCAL_URL` default;
 * - `vite dev` with `SMOG_DEV_RENDER_MODE=local` (the `RENDER_WORKFLOW`
 *   binding) and the Mux fake's URL, token and webhook secret.
 *
 * Then, as the seeded admin (`bun -F @smog/db migrate:dev && bun -F
 * @smog/db seed:dev` first): an unpublished gesture and category of its
 * own, a logo through the public upload, an `open` checkout seeded through
 * `/dev/e2e-seed`, and `admin.sponsorships.markPaid`. That runs the real
 * path: `payment.settled` → the render job → `render.requested` → the
 * `RenderSponsorshipVideo` Workflow (source lookup, master access, the
 * polls, the logo, the render, the upload, the Mux webhook, the commit).
 * It waits for `in_review`, checks the committed playback id and the job,
 * reads the uploaded file with mediabunny (H.264 at the source's size and
 * frame count ± 1) and saves it to `packages/render/.render-out/` (or
 * `RENDER_LOOP_OUT_DIR`). Everything it made is removed at the end, and
 * on Ctrl+C or SIGTERM too (exit 130 or 143); its servers run in their
 * own process groups, so the site is still up to remove its fixtures.
 *
 * Ports: `RENDER_LOOP_SITE_PORT` (5296) and `RENDER_LOOP_MUX_PORT` (4216).
 * A `.dev.vars` with Mux or `RENDER_LOCAL_URL` values overrides what this
 * script sets: leave them commented out (as `.dev.vars.example` does). The
 * local dev mailbox is saved first and put back after, so the loop's
 * emails (rendered for its port) never reach the e2e's `/dev/mail`.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type FakeMuxServer,
  startFakeMuxServer,
} from "@smog/video/testing/server";
import { type Subprocess, sleep, spawn } from "bun";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

const SITE_DIR = fileURLToPath(new URL("..", import.meta.url));
const RENDER_DIR = fileURLToPath(
  new URL("../../../packages/render", import.meta.url)
);
const SITE_PORT = Number(process.env.RENDER_LOOP_SITE_PORT ?? 5296);
const MUX_PORT = Number(process.env.RENDER_LOOP_MUX_PORT ?? 4216);
/** The dev Worker's `RENDER_LOCAL_URL` default (`RENDER_LOCAL_DEFAULT_URL`). */
const RENDER_PORT = 3002;
const ORIGIN = `http://localhost:${SITE_PORT}`;
const OUT_DIR =
  process.env.RENDER_LOOP_OUT_DIR ?? join(RENDER_DIR, ".render-out");
const WEBHOOK_SECRET = "render-loop-mux-webhook-secret";
const FAKE_TOKEN = { id: "fake-token-id", secret: "fake-token-secret" };
/** A fixed public-looking playback id for the loop's own gesture. */
const PLAYBACK_ID = "RenderLoopSourcePlaybackId000000000000000001";
const SEED_ADMIN = { email: "admin@smog.test", password: "smog-dev-admin" };
/** The render fixture: 2 s at 30 fps, 360 × 640. */
const SOURCE = { frames: 60, height: 640, width: 360 } as const;
const STARTUP_MS = 4 * 60_000;
const RENDER_DEADLINE_MS = 10 * 60_000;
const POLL_MS = 2000;
const FRAME_TOLERANCE = 1;

/** `Cookie` from `Set-Cookie` headers: each cookie's name and value. */
export function cookieHeader(setCookies: readonly string[]): string {
  return setCookies
    .map((cookie) => cookie.split(";")[0]?.trim() ?? "")
    .filter((pair) => pair.length > 0)
    .join("; ");
}

interface AssetLike {
  file: Uint8Array | null;
  id: string;
  passthrough: string | null;
  playbackId: string | null;
  status: string;
}

/** The ready asset the job's render upload became, or `null`. */
export function renderAssetOf<T extends AssetLike>(
  assets: Iterable<T>,
  renderJobId: string
): T | null {
  for (const asset of assets) {
    if (
      asset.passthrough === `render-job:${renderJobId}` &&
      asset.status === "ready"
    ) {
      return asset;
    }
  }
  return null;
}

export interface RenderedVideo {
  codec: string | null;
  frames: number;
  height: number;
  width: number;
}

/** What is wrong with the rendered file against the source (empty: nothing). */
export function checkRenderedVideo(
  video: RenderedVideo | null,
  source: { frames: number; height: number; width: number }
): string[] {
  if (!video) {
    return ["no video track"];
  }
  const problems: string[] = [];
  if (video.codec !== "avc") {
    problems.push(`codec ${video.codec}, expected avc (H.264)`);
  }
  if (video.width !== source.width || video.height !== source.height) {
    problems.push(
      `size ${video.width} × ${video.height}, expected ${source.width} × ${source.height}`
    );
  }
  if (Math.abs(video.frames - source.frames) > FRAME_TOLERANCE) {
    problems.push(
      `${video.frames} frames, expected ${source.frames} ± ${FRAME_TOLERANCE}`
    );
  }
  return problems;
}

/** The file's first video track, read with mediabunny (packets = frames). */
async function readRenderedVideo(
  bytes: Uint8Array
): Promise<RenderedVideo | null> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      return null;
    }
    const stats = await track.computePacketStats();
    return {
      codec: track.codec,
      frames: stats.packetCount,
      height: await track.getDisplayHeight(),
      width: await track.getDisplayWidth(),
    };
  } finally {
    input.dispose();
  }
}

function log(message: string): void {
  console.log(`[render-loop] ${message}`);
}

const children: Subprocess[] = [];

function start(
  name: string,
  command: string[],
  cwd: string,
  env: Record<string, string>
): Subprocess {
  const child = spawn(command, {
    cwd,
    // Its own process group: a Ctrl+C reaches only this script, which then
    // removes its fixtures through the still running site before it stops
    // the children (task 9 review M-5).
    detached: true,
    env: { ...process.env, ...env },
    stderr: "inherit",
    stdout: "inherit",
  });
  children.push(child);
  child.exited.then((code) => {
    if (!stopping) {
      console.error(`[render-loop] ${name} exited with ${code}`);
    }
  });
  return child;
}

let stopping = false;

async function stopChildren(): Promise<void> {
  stopping = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  await Promise.all(
    children.map((child) =>
      Promise.race([child.exited, sleep(10_000).then(() => child.kill())])
    )
  );
}

/** What to undo, in the order it was set up (run last first). */
type Cleanup = () => Promise<void>;
const cleanups: Cleanup[] = [];
let cleaning: Promise<void> | null = null;

function onCleanup(cleanup: Cleanup): void {
  cleanups.push(cleanup);
}

/**
 * Runs every cleanup, last registered first, each once; one that fails is
 * logged and the others still run.
 */
export async function runCleanups(list: Cleanup[]): Promise<void> {
  for (let cleanup = list.pop(); cleanup; cleanup = list.pop()) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: undone in reverse order, one at a time.
      await cleanup();
    } catch (error) {
      console.error("[render-loop] Failed to clean up:", error);
    }
  }
}

/** The cleanup, once: the end of `main` and a signal share it. */
function cleanUp(): Promise<void> {
  cleaning ??= runCleanups(cleanups);
  return cleaning;
}

/** A failure that ends a wait at once (a `render_failed` job). */
class LoopFailure extends Error {}

async function waitFor(
  what: string,
  check: () => Promise<boolean>,
  deadlineMs: number
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling until the check passes.
      if (await check()) {
        return;
      }
    } catch (error) {
      if (error instanceof LoopFailure) {
        throw error;
      }
      // Not there yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`[render-loop] ${what} did not happen in time`);
    }
    await sleep(POLL_MS);
  }
}

async function answers(url: string): Promise<boolean> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  await response.body?.cancel();
  return response.ok;
}

/** A same-origin client for the dev site, with the admin's cookies. */
function siteClient() {
  let cookies = "";
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    origin: ORIGIN,
    ...(cookies ? { cookie: cookies } : {}),
  });

  async function post(path: string, body: unknown): Promise<Response> {
    return await fetch(`${ORIGIN}${path}`, {
      body: JSON.stringify(body),
      headers: headers(),
      method: "POST",
    });
  }

  return {
    async put(
      url: string,
      body: Uint8Array<ArrayBuffer>,
      extra: Record<string, string>
    ) {
      const response = await fetch(url, {
        body,
        headers: { ...extra, origin: ORIGIN },
        method: "PUT",
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(
          `[render-loop] The logo upload answered ${response.status}`
        );
      }
    },
    async rpc<T>(path: string, input: unknown): Promise<T> {
      const response = await post(`/api/rpc/${path}`, { json: input });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `[render-loop] ${path} answered ${response.status}: ${text}`
        );
      }
      return (JSON.parse(text) as { json: T }).json;
    },
    async seed(seeds: unknown[]): Promise<unknown> {
      const response = await post("/dev/e2e-seed", seeds);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          `[render-loop] /dev/e2e-seed answered ${response.status}: ${text}`
        );
      }
      return text ? JSON.parse(text) : null;
    },
    async signIn(): Promise<void> {
      const response = await post("/api/auth/sign-in/email", SEED_ADMIN);
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(
          `[render-loop] The admin sign-in answered ${response.status}: run \`bun -F @smog/db migrate:dev && bun -F @smog/db seed:dev\` first`
        );
      }
      cookies = cookieHeader(response.headers.getSetCookie());
    },
  };
}

type SiteClient = ReturnType<typeof siteClient>;

interface Fixture {
  categoryId: string;
  gestureId: string;
  gestureName: string;
  slug: string;
}

async function makeFixture(
  site: SiteClient,
  assetId: string
): Promise<Fixture> {
  const word = crypto
    .randomUUID()
    .slice(0, 8)
    .replace(/[^a-z]/g, "q");
  const category = await site.rpc<{ id: string }>("admin/categories/create", {
    name: `Zzcat loop ${word}`,
    published: false,
  });
  const gesture = await site.rpc<{ id: string; name: string; slug: string }>(
    "admin/gestures/create",
    {
      categoryIds: [category.id],
      muxAssetId: assetId,
      name: `Zzloop ${word}`,
      playbackId: PLAYBACK_ID,
      published: false,
    }
  );
  return {
    categoryId: category.id,
    gestureId: gesture.id,
    gestureName: gesture.name,
    slug: gesture.slug,
  };
}

async function removeFixture(
  site: SiteClient,
  fixture: Fixture
): Promise<void> {
  await site.seed([{ op: "resetSponsorships", slugs: [fixture.slug] }]);
  await site.rpc("admin/gestures/delete", {
    confirmName: fixture.gestureName,
    id: fixture.gestureId,
  });
  await site.rpc("admin/categories/delete", { id: fixture.categoryId });
}

async function uploadLogo(site: SiteClient): Promise<string> {
  const body = new Uint8Array(
    await readFile(join(SITE_DIR, "e2e/fixtures/logo.png"))
  );
  const upload = await site.rpc<{
    headers: Record<string, string>;
    key: string;
    uploadUrl: string;
  }>("sponsorships/uploadLogo", {
    contentType: "image/png",
    size: body.byteLength,
  });
  await site.put(upload.uploadUrl, body, upload.headers);
  return upload.key;
}

interface Detail {
  renderJobs: {
    attempt: number;
    error: string | null;
    id: string;
    playbackId: string | null;
    status: string;
  }[];
  sponsorship: { hasLogo: boolean; status: string };
  video: { fakeRender: boolean; playbackId: string | null };
}

async function runLoop(mux: FakeMuxServer, site: SiteClient): Promise<void> {
  const source = mux.fake.addAsset({ playbackId: PLAYBACK_ID });
  await site.signIn();
  const fixture = await makeFixture(site, source.id);
  log(`gesture ${fixture.slug} (playback ${PLAYBACK_ID}, asset ${source.id})`);
  // Removed at the end, or on Ctrl+C while the site still runs.
  onCleanup(() => removeFixture(site, fixture));
  const logoKey = await uploadLogo(site);
  const id = `e2e-loop-${crypto.randomUUID().slice(0, 8)}`;
  await site.seed([
    {
      displayName: "Bakkerij De Lus",
      gestureSlugs: [fixture.slug],
      id,
      logo: true,
      logoKey,
      op: "sponsorshipCheckout",
      paymentStatus: "open",
      status: "awaiting_payment",
    },
  ]);
  const sponsorshipId = `${id}-0`;
  const started = Date.now();
  await site.rpc("admin/sponsorships/markPaid", { paymentId: id });
  log(`marked ${id} paid; waiting for the Workflow`);

  let detail: Detail | null = null;
  await waitFor(
    "in_review",
    async () => {
      detail = await site.rpc<Detail>("admin/sponsorships/get", {
        id: sponsorshipId,
      });
      const { status } = detail.sponsorship;
      if (status === "render_failed") {
        throw new LoopFailure(
          `[render-loop] render_failed: ${detail.renderJobs[0]?.error ?? "?"}`
        );
      }
      return status === "in_review";
    },
    RENDER_DEADLINE_MS
  );
  const final = detail as Detail | null;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const job = final?.renderJobs[0];
  if (!(final && job)) {
    throw new Error("[render-loop] no render job");
  }
  log(
    `in_review after ${seconds} s: job ${job.id} ${job.status}, attempt ${job.attempt}`
  );
  const asset = renderAssetOf(mux.fake.assets.values(), job.id);
  if (!asset?.file) {
    throw new Error("[render-loop] the render asset has no uploaded file");
  }
  const problems: string[] = [];
  if (job.status !== "succeeded") {
    problems.push(`job ${job.status}`);
  }
  if (final.video.playbackId !== asset.playbackId || final.video.fakeRender) {
    problems.push(
      `sponsorship video ${final.video.playbackId} (fake render: ${final.video.fakeRender}), expected ${asset.playbackId}`
    );
  }
  if (!final.sponsorship.hasLogo) {
    problems.push("the sponsorship has no logo");
  }
  if (source.master?.status !== "ready") {
    problems.push(`source master ${source.master?.status ?? "off"}`);
  }
  const video = await readRenderedVideo(asset.file);
  problems.push(...checkRenderedVideo(video, SOURCE));
  await mkdir(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, "local-loop.mp4");
  await writeFile(out, asset.file);
  log(
    `rendered ${asset.file.byteLength} bytes: ${video?.codec} ${video?.width} × ${video?.height}, ${video?.frames} frames → ${out}`
  );
  if (problems.length > 0) {
    throw new Error(`[render-loop] ${problems.join("; ")}`);
  }
  log("ok: a paid sponsorship reached in_review through the real Workflow");
}

/** The local dev mailbox's KV key (`DEV_MAIL_KEY` in `@smog/email`). */
const DEV_MAIL_KEY = "dev:mail";

/** What `wrangler kv key get dev:mail` found. */
export type DevMail =
  | { kind: "absent" }
  /** A stored mailbox (a JSON list), to put back as it was. */
  | { kind: "mailbox"; value: string }
  /** Output this script cannot read: the key is left alone, never deleted. */
  | { kind: "unreadable" };

const VALUE_NOT_FOUND = /^Value not found\b/m;

/**
 * `wrangler kv key get` output as the mailbox it found (task 9 review
 * M-5): a JSON list is the mailbox, wrangler's "Value not found" (on
 * stdout or stderr, with nothing else) means there is none, and anything
 * else (a warning before the value, a parse failure) is `unreadable`, so
 * the restore never deletes a mailbox it could not read.
 */
export function devMailOf(stdout: string, stderr = ""): DevMail {
  const value = stdout.trim();
  if (value.startsWith("[")) {
    try {
      if (Array.isArray(JSON.parse(value))) {
        return { kind: "mailbox", value };
      }
    } catch {
      return { kind: "unreadable" };
    }
  }
  if (
    (value === "" || VALUE_NOT_FOUND.test(value)) &&
    (VALUE_NOT_FOUND.test(value) || VALUE_NOT_FOUND.test(stderr))
  ) {
    return { kind: "absent" };
  }
  return { kind: "unreadable" };
}

/** Runs `wrangler kv key …` on the local dev KV; its output. */
async function devKv(
  args: string[]
): Promise<{ stderr: string; stdout: string }> {
  const child = spawn(
    [
      "bunx",
      "wrangler",
      "kv",
      "key",
      ...args,
      "--binding",
      "KV",
      "--local",
      "--env",
      "dev",
    ],
    {
      cwd: SITE_DIR,
      env: { ...process.env, CLOUDFLARE_ENV: "dev" },
      stderr: "pipe",
      stdout: "pipe",
    }
  );
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if ((await child.exited) !== 0) {
    throw new Error(`[render-loop] wrangler kv key ${args[0]} failed`);
  }
  return { stderr, stdout };
}

/**
 * The loop's emails are rendered for its own origin and land in the shared
 * local dev mailbox, where the e2e (which reads `/dev/mail` on its own
 * port) would find them: the mailbox is saved first and put back after.
 * A mailbox that could not be read is left as it is (with a warning).
 */
async function saveDevMail(): Promise<Cleanup> {
  const read = await devKv(["get", DEV_MAIL_KEY]);
  const saved = devMailOf(read.stdout, read.stderr);
  return async () => {
    if (saved.kind === "unreadable") {
      console.warn(
        `[render-loop] The dev mailbox (${DEV_MAIL_KEY}) could not be read before the loop: it is left as it is, with the loop's emails in it`
      );
      return;
    }
    if (saved.kind === "absent") {
      await devKv(["delete", DEV_MAIL_KEY]);
      return;
    }
    const file = join(OUT_DIR, "dev-mail.json");
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(file, saved.value);
    await devKv(["put", DEV_MAIL_KEY, "--path", file]);
    await rm(file, { force: true });
  };
}

async function main(): Promise<void> {
  if (
    await answers(`http://127.0.0.1:${RENDER_PORT}/health`).catch(() => false)
  ) {
    throw new Error(
      `[render-loop] port ${RENDER_PORT} is taken (a render server already runs?): stop it first`
    );
  }
  onCleanup(await saveDevMail());
  const mux = startFakeMuxServer({
    playbackId: PLAYBACK_ID,
    port: MUX_PORT,
    readyAfterMs: 1000,
    webhook: { secret: WEBHOOK_SECRET, url: `${ORIGIN}/api/webhooks/mux` },
  });
  onCleanup(() => mux.stop());
  // Stopped after the fixtures are removed (they need the site).
  onCleanup(stopChildren);
  try {
    start("the render server", ["bun", "src/server/main.ts"], RENDER_DIR, {
      PORT: String(RENDER_PORT),
      RENDER_ALLOW_HTTP: "1",
      RENDER_BUNDLE_DIR: join(RENDER_DIR, ".render-bundle"),
      RENDER_ENVIRONMENT: "dev",
    });
    start(
      "vite dev",
      ["bunx", "vite", "dev", "--port", String(SITE_PORT), "--strictPort"],
      SITE_DIR,
      {
        SMOG_DEV_MUX_API_URL: mux.url,
        SMOG_DEV_MUX_TOKEN_ID: FAKE_TOKEN.id,
        SMOG_DEV_MUX_TOKEN_SECRET: FAKE_TOKEN.secret,
        SMOG_DEV_MUX_WEBHOOK_SECRET: WEBHOOK_SECRET,
        SMOG_DEV_RENDER_MODE: "local",
        SMOG_DEV_SITE_URL: ORIGIN,
      }
    );
    await waitFor(
      "the render server's /health",
      () => answers(`http://127.0.0.1:${RENDER_PORT}/health`),
      STARTUP_MS
    );
    await waitFor(
      "the site's /api/health",
      () => answers(`${ORIGIN}/api/health`),
      STARTUP_MS
    );
    log("servers up");
    await runLoop(mux, siteClient());
  } finally {
    await cleanUp();
  }
}

/** The exit status of a run ended by `signal` (128 + its number). */
const SIGNAL_EXIT: Record<"SIGINT" | "SIGTERM", number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

if (import.meta.main) {
  // Ctrl+C (or a SIGTERM) runs the same cleanup as the end of the loop:
  // the fixtures, the children, the Mux fake and the dev mailbox (M-5).
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      log(`${signal}: cleaning up`);
      cleanUp().finally(() => process.exit(SIGNAL_EXIT[signal]));
    });
  }
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
