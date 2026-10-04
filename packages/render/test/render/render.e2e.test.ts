/**
 * `bun -F @smog/render test:render` (phase 7 ruling 16): a real render with
 * Chrome. In the CI `render` lane it runs on the host against the image
 * (`RENDER_SERVER_URL`, the container on `--network host`); locally it
 * starts `src/server/main.ts` itself (set `RENDER_BROWSER_EXECUTABLE`, or
 * Remotion downloads its own browser). The source and the upload sink are
 * local servers here, so no test file ships in the image.
 *
 * Checks: the uploaded file is H.264 at the source's even size with its
 * frame count ± 1, and the last frame has the brand green (`#00805F`) in
 * line 1's rows. The full-size probe runs on a short name, where line 1
 * keeps its base size: at least 300 px within ΔE < 10 (about 770 measured,
 * so a shift of a few ΔE in the antialiasing cannot fail it). With the
 * 35-character name both lines shrink to fit, and the line must still be
 * there (at least 100 px; about 300 measured). A missing or wrong-colour
 * line scores about 0 against the magenta fixture. The counts at several
 * ΔE cut-offs are logged. The long-name render uses a logo of about 2 MiB
 * (the size limit). The last frames are saved as PNGs for the parity
 * review (a CI artifact).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Subprocess, spawn } from "bun";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import {
  RENDER_LOGO_MAX_BYTES,
  RENDER_OVERLAY_LAYOUT,
  type RenderRequest,
  renderResultSchema,
} from "../../src/contract";
import {
  countNear,
  encodePng,
  hexToRgb,
  lastFrame,
  type RgbFrame,
} from "../support/images";
import {
  type LocalServer,
  serveFiles,
  serveUploadSink,
} from "../support/servers";

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE = join(PACKAGE_DIR, "test/fixtures/source-2s.mp4");
const OUT_DIR = process.env.RENDER_OUT_DIR || join(PACKAGE_DIR, ".render-out");
const LOCAL_PORT = Number(process.env.RENDER_TEST_PORT || 3092);
const STARTUP_MS = 5 * 60_000;

/** The fixture: 2 s at 30 fps, 360 × 640 (`bun -F @smog/render fixture`). */
const SOURCE = { frames: 60, height: 640, width: 360 } as const;
/** A 35-character name (`DISPLAY_NAME_MAX`), the longest a sponsor can type. */
const LONG_NAME = "Bakkerij Van den Broeck & Zonen bv.";
/** A short name in another script: line 1 keeps its base size. */
const SHORT_ARABIC_NAME = "مخبز الأمل";
const GREEN = hexToRgb(RENDER_OVERLAY_LAYOUT.text.color);
const MAX_DELTA_E = 10;
const MIN_GREEN_SHORT_NAME = 300;
const MIN_GREEN_LONG_NAME = 100;
const LOGGED_DELTA_E = [6, 8, 10, 12, 15] as const;
const TRAILING_SLASHES = /\/+$/;

/** Line 1's brand-green pixels, logged at several ΔE cut-offs. */
function greenInLine1(frame: RgbFrame, label: string): number {
  const { fontSize, y } = RENDER_OVERLAY_LAYOUT.text;
  const top = Math.floor(y * SOURCE.height);
  const bottom = Math.ceil((y + 1.2 * fontSize) * SOURCE.height);
  const counts = LOGGED_DELTA_E.map((maxDeltaE) => ({
    count: countNear(frame, GREEN, { bottom, maxDeltaE, top }),
    maxDeltaE,
  }));
  console.log(
    `[render] ${label}: line 1 green (${RENDER_OVERLAY_LAYOUT.text.color}, rows ${top}..${bottom}) ${counts
      .map(({ count, maxDeltaE }) => `ΔE<${maxDeltaE}: ${count}`)
      .join(", ")}`
  );
  return countNear(frame, GREEN, { bottom, maxDeltaE: MAX_DELTA_E, top });
}

let serverUrl: string;
let child: Subprocess | null = null;
let source: LocalServer;
let tmp: string;
let logoDataUrl: string;

/** A logo just under the 2 MiB limit: a blue disc on white, uncompressed. */
function bigLogo(): Uint8Array {
  const side = Math.floor(Math.sqrt((RENDER_LOGO_MAX_BYTES - 4096) / 4.01));
  const centre = side / 2;
  return encodePng(side, side, (x, y) =>
    Math.hypot(x - centre, y - centre) < side * 0.4
      ? [30, 60, 200, 255]
      : [255, 255, 255, 255]
  );
}

async function waitForHealth(url: string): Promise<unknown> {
  const deadline = Date.now() + STARTUP_MS;
  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling until the server answers.
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`[render] ${url}/health did not answer in time`);
    }
    const exitCode = child ? child.exitCode : null;
    if (exitCode !== null) {
      throw new Error(`[render] the server exited with ${exitCode}`);
    }
    await Bun.sleep(500);
  }
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "smog-render-e2e-"));
  await mkdir(OUT_DIR, { recursive: true });
  const logo = bigLogo();
  expect(logo.byteLength).toBeLessThanOrEqual(RENDER_LOGO_MAX_BYTES);
  expect(logo.byteLength).toBeGreaterThan(RENDER_LOGO_MAX_BYTES * 0.95);
  logoDataUrl = `data:image/png;base64,${Buffer.from(logo).toString("base64")}`;
  source = serveFiles({ "/source-2s.mp4": FIXTURE });

  if (process.env.RENDER_SERVER_URL) {
    serverUrl = process.env.RENDER_SERVER_URL.replace(TRAILING_SLASHES, "");
  } else {
    serverUrl = `http://127.0.0.1:${LOCAL_PORT}`;
    child = spawn(["bun", "src/server/main.ts"], {
      cwd: PACKAGE_DIR,
      env: {
        ...process.env,
        PORT: String(LOCAL_PORT),
        RENDER_ALLOW_HTTP: "1",
        RENDER_BUNDLE_DIR: join(PACKAGE_DIR, ".render-bundle"),
        RENDER_ENVIRONMENT: "dev",
        RENDER_TMP_DIR: join(tmp, "work"),
      },
      stderr: "inherit",
      stdout: "inherit",
    });
  }
  console.log(
    "[render] health:",
    JSON.stringify(await waitForHealth(serverUrl))
  );
}, STARTUP_MS + 10_000);

afterAll(async () => {
  child?.kill("SIGTERM");
  await child?.exited;
  await source.stop();
  await rm(tmp, { force: true, recursive: true });
});

async function render(
  overrides: { displayName: string; logoDataUrl: string | null },
  name: string
) {
  const sink = serveUploadSink();
  try {
    const body: RenderRequest = {
      input: {
        displayName: overrides.displayName,
        logoKey: overrides.logoDataUrl ? "logos/render-lane" : null,
        sourcePlaybackId: "fixture",
        v: 1,
      },
      logoDataUrl: overrides.logoDataUrl,
      renderJobId: randomUUID(),
      sourceUrl: `${source.url}/source-2s.mp4`,
      uploadUrl: `${sink.url}/upload/${name}`,
      v: 1,
    };
    const started = Date.now();
    const response = await fetch(`${serverUrl}/render`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = renderResultSchema.parse(await response.json());
    console.log(
      `[render] ${name}: HTTP ${response.status} in ${Date.now() - started} ms`,
      JSON.stringify(result)
    );
    expect(result.ok).toBe(true);
    expect(response.status).toBe(200);
    const [upload] = sink.uploads;
    if (!(result.ok && upload)) {
      throw new Error("no upload");
    }
    const mp4 = join(OUT_DIR, `${name}.mp4`);
    await writeFile(mp4, upload.body);
    return { mp4, result, upload };
  } finally {
    await sink.stop();
  }
}

describe("a real render", () => {
  it("renders the fixture with a 2 MiB logo and a 35-character name", async () => {
    expect(LONG_NAME).toHaveLength(35);
    const { mp4, result, upload } = await render(
      { displayName: LONG_NAME, logoDataUrl },
      "render"
    );
    expect(result).toMatchObject({
      frames: SOURCE.frames,
      height: SOURCE.height,
      width: SOURCE.width,
    });

    // The PUT: an MP4 with its type and length.
    expect(upload.method).toBe("PUT");
    expect(upload.contentType).toBe("video/mp4");
    expect(upload.contentLength).toBe(String(upload.body.byteLength));
    if (result.ok) {
      expect(result.bytes).toBe(upload.body.byteLength);
    }

    // The file: H.264, the source's even size, its frame count ± 1.
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(upload.body),
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      expect(track?.codec).toBe("avc");
      expect(await track?.getDisplayWidth()).toBe(SOURCE.width);
      expect(await track?.getDisplayHeight()).toBe(SOURCE.height);
      const stats = await track?.computePacketStats();
      expect(
        Math.abs((stats?.packetCount ?? 0) - SOURCE.frames)
      ).toBeLessThanOrEqual(1);
    } finally {
      input.dispose();
    }

    // The last frame: line 1 is there, shrunk with the long name.
    const still = join(OUT_DIR, "render-last-frame.png");
    const { count, frame } = lastFrame(mp4, SOURCE, still);
    expect(Math.abs(count - SOURCE.frames)).toBeLessThanOrEqual(1);
    expect(greenInLine1(frame, "35-character name")).toBeGreaterThanOrEqual(
      MIN_GREEN_LONG_NAME
    );
  });

  it("renders a short name in another script (Arabic): line 1 at full size", async () => {
    const { mp4, result } = await render(
      { displayName: SHORT_ARABIC_NAME, logoDataUrl: null },
      "render-arabic"
    );
    expect(result).toMatchObject({ frames: SOURCE.frames });
    const { frame } = lastFrame(
      mp4,
      SOURCE,
      join(OUT_DIR, "render-arabic-last-frame.png")
    );
    expect(greenInLine1(frame, "short name")).toBeGreaterThanOrEqual(
      MIN_GREEN_SHORT_NAME
    );
  });
});
