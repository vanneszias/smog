import { describe, expect, it } from "bun:test";
import {
  isRetryableRenderError,
  logoDataUrlByteLength,
  RENDER_ERROR_CODES,
  RENDER_ERROR_MESSAGE_MAX,
  RENDER_ERROR_STATUS,
  RENDER_FPS,
  RENDER_INPUT_VERSION,
  RENDER_LOGO_MAX_BYTES,
  RENDER_OVERLAY_LAYOUT,
  RENDER_REQUEST_VERSION,
  renderInputSchema,
  renderRequestSchema,
  renderResultSchema,
  SPONSORED_VIDEO_ID,
} from "./contract";

const VALID = {
  displayName: "Acme BV",
  logoKey: "logos/0b6c6d4e-6c43-4e1c-9a59-8a1b4c0d9e01",
  sourcePlaybackId: "VZtzUzGRv02OhRnZCxcNg49OilvolTqdnFLEqBsTwaxU",
  v: 1 as const,
};

describe("renderInputSchema (v1, ruling 7)", () => {
  it("accepts the v1 input, with or without a logo", () => {
    expect(RENDER_INPUT_VERSION).toBe(1);
    expect(renderInputSchema.parse(VALID)).toEqual(VALID);
    expect(renderInputSchema.parse({ ...VALID, logoKey: null }).logoKey).toBe(
      null
    );
  });

  it("refuses another version, a missing logo key and a bad display name", () => {
    expect(renderInputSchema.safeParse({ ...VALID, v: 2 }).success).toBe(false);
    const { logoKey: _, ...noLogoKey } = VALID;
    expect(renderInputSchema.safeParse(noLogoKey).success).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "" }).success
    ).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "x".repeat(36) })
        .success
    ).toBe(false);
    expect(
      renderInputSchema.safeParse({ ...VALID, displayName: "x".repeat(35) })
        .success
    ).toBe(true);
    expect(
      renderInputSchema.safeParse({ ...VALID, sourcePlaybackId: "" }).success
    ).toBe(false);
  });

  it("reads a later optional field without failing (v1 ignores it)", () => {
    const parsed = renderInputSchema.parse({ ...VALID, future: "x" });
    expect(parsed).toMatchObject(VALID);
  });
});

describe("RENDER_OVERLAY_LAYOUT (the old SPONSOR_OVERLAY_CONFIG preset)", () => {
  it("fixes the logo box, the text line and the colour", () => {
    expect(RENDER_OVERLAY_LAYOUT).toEqual({
      fadeInSeconds: 1,
      logo: { centerX: 0.5, centerY: 0.78, size: 0.15 },
      overlaySeconds: 5,
      slideUpPx: 30,
      text: {
        color: "#00805F",
        fontSize: 0.04,
        intro: "Met de warme steun van:",
        y: 0.85,
      },
    });
  });
});

const JOB_ID = "6f1c2a4e-8b3d-4f7a-9c2e-1d5b7a9e3f20";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function dataUrl(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

const REQUEST = {
  input: VALID,
  logoDataUrl: dataUrl("image/png", PNG_BYTES),
  renderJobId: JOB_ID,
  sourceUrl: "https://stream.mux.com/abc/highest.mp4",
  uploadUrl: "https://storage.googleapis.com/video-uploads/x",
  v: 1 as const,
};

describe("the render server's HTTP contract (phase 7 ruling 1)", () => {
  it("fixes the composition id and the frame rate", () => {
    expect(SPONSORED_VIDEO_ID).toBe("SponsoredVideo");
    expect(RENDER_FPS).toBe(30);
    expect(RENDER_REQUEST_VERSION).toBe(1);
  });

  it("accepts a request with or without a logo", () => {
    expect(renderRequestSchema.parse(REQUEST)).toEqual(REQUEST);
    expect(
      renderRequestSchema.parse({ ...REQUEST, logoDataUrl: null }).logoDataUrl
    ).toBe(null);
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(
        renderRequestSchema.safeParse({
          ...REQUEST,
          logoDataUrl: dataUrl(type, PNG_BYTES),
        }).success
      ).toBe(true);
    }
  });

  it("refuses a bad version, job id, input or URL", () => {
    const bad: Record<string, unknown>[] = [
      { v: 2 },
      { renderJobId: "job-1" },
      { input: { ...VALID, v: 2 } },
      { sourceUrl: "not a url" },
      { sourceUrl: "ftp://example.com/a.mp4" },
      { uploadUrl: "file:///etc/passwd" },
      { logoDataUrl: undefined },
    ];
    for (const change of bad) {
      expect(
        renderRequestSchema.safeParse({ ...REQUEST, ...change }).success
      ).toBe(false);
    }
  });

  it("takes a PNG, JPEG or WebP data URL only", () => {
    for (const logoDataUrl of [
      dataUrl("image/gif", PNG_BYTES),
      dataUrl("image/svg+xml", PNG_BYTES),
      "data:image/png,rawbytes",
      "data:image/png;base64,not base64!",
      "data:image/png;base64,abc",
      "data:image/png;base64,",
      "https://example.com/logo.png",
    ]) {
      expect(
        renderRequestSchema.safeParse({ ...REQUEST, logoDataUrl }).success
      ).toBe(false);
    }
  });

  it("caps the decoded logo at 2 MiB, the checkout's own limit", () => {
    expect(RENDER_LOGO_MAX_BYTES).toBe(2 * 1024 * 1024);
    const atCap = new Uint8Array(RENDER_LOGO_MAX_BYTES);
    const overCap = new Uint8Array(RENDER_LOGO_MAX_BYTES + 1);
    expect(
      renderRequestSchema.safeParse({
        ...REQUEST,
        logoDataUrl: dataUrl("image/png", atCap),
      }).success
    ).toBe(true);
    expect(
      renderRequestSchema.safeParse({
        ...REQUEST,
        logoDataUrl: dataUrl("image/png", overCap),
      }).success
    ).toBe(false);
  });

  it("decodes the byte length of a data URL with or without padding", () => {
    for (const length of [1, 2, 3, 4, 5]) {
      expect(
        logoDataUrlByteLength(dataUrl("image/png", new Uint8Array(length)))
      ).toBe(length);
    }
  });

  it("answers a success or a coded failure", () => {
    const ok = {
      bytes: 51_200,
      frames: 60,
      height: 640,
      ms: 4200,
      ok: true as const,
      width: 360,
    };
    expect(renderResultSchema.parse(ok)).toEqual(ok);
    for (const code of RENDER_ERROR_CODES) {
      const failure = { code, message: "x", ok: false as const };
      expect(renderResultSchema.parse(failure)).toEqual(failure);
    }
    expect(
      renderResultSchema.safeParse({ code: "teapot", message: "x", ok: false })
        .success
    ).toBe(false);
    expect(
      renderResultSchema.safeParse({
        code: "renderFailed",
        message: "x".repeat(RENDER_ERROR_MESSAGE_MAX),
        ok: false,
      }).success
    ).toBe(true);
    expect(
      renderResultSchema.safeParse({
        code: "renderFailed",
        message: "x".repeat(RENDER_ERROR_MESSAGE_MAX + 1),
        ok: false,
      }).success
    ).toBe(false);
    expect(RENDER_ERROR_MESSAGE_MAX).toBe(2000);
    expect(renderResultSchema.safeParse({ ...ok, frames: 0 }).success).toBe(
      false
    );
    expect(renderResultSchema.safeParse({ ...ok, width: 361 }).success).toBe(
      false
    );
    expect(renderResultSchema.safeParse({ ...ok, ok: false }).success).toBe(
      false
    );
  });

  it("lists the error codes and splits them into retryable and final", () => {
    expect(RENDER_ERROR_CODES).toEqual([
      "invalidInput",
      "sourceUnreadable",
      "logoUnreadable",
      "busy",
      "renderFailed",
      "uploadFailed",
    ]);
    const retryable = RENDER_ERROR_CODES.filter(isRetryableRenderError);
    expect(retryable).toEqual(["busy", "renderFailed", "uploadFailed"]);
  });

  it("answers a 4xx for a final error and a 5xx for a retryable one", () => {
    for (const code of RENDER_ERROR_CODES) {
      const status = RENDER_ERROR_STATUS[code];
      expect(status >= 500).toBe(isRetryableRenderError(code));
      expect(status >= 400 && status < 600).toBe(true);
    }
    expect(RENDER_ERROR_STATUS.invalidInput).toBe(422);
    expect(RENDER_ERROR_STATUS.busy).toBe(503);
  });
});
