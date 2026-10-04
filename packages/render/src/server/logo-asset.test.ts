import { describe, expect, it } from "bun:test";
import { RENDER_LOGO_MAX_BYTES } from "../contract";
import {
  createLogoAssets,
  decodeLogoDataUrl,
  isLoopback,
  logoAssetUrl,
  matchLogoAssetPath,
  sniffLogoType,
} from "./logo-asset";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2];
const WEBP = [0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 1];

function dataUrl(type: string, bytes: number[] | Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("sniffLogoType", () => {
  it("knows PNG, JPEG and WebP by their magic bytes", () => {
    expect(sniffLogoType(new Uint8Array(PNG))).toBe("image/png");
    expect(sniffLogoType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(sniffLogoType(new Uint8Array(WEBP))).toBe("image/webp");
    expect(sniffLogoType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
});

describe("decodeLogoDataUrl", () => {
  it("decodes each allowed type", () => {
    expect(decodeLogoDataUrl(dataUrl("image/png", PNG))).toEqual({
      bytes: new Uint8Array(PNG),
      contentType: "image/png",
    });
    expect(decodeLogoDataUrl(dataUrl("image/jpeg", JPEG)).contentType).toBe(
      "image/jpeg"
    );
    expect(decodeLogoDataUrl(dataUrl("image/webp", WEBP)).contentType).toBe(
      "image/webp"
    );
  });

  it("refuses bytes that are not the declared type (logoUnreadable)", () => {
    expect(() => decodeLogoDataUrl(dataUrl("image/jpeg", PNG))).toThrow(
      expect.objectContaining({ code: "logoUnreadable" })
    );
    expect(() => decodeLogoDataUrl("data:image/gif;base64,R0lG")).toThrow(
      expect.objectContaining({ code: "logoUnreadable" })
    );
  });

  it("refuses more than the cap", () => {
    const big = new Uint8Array(RENDER_LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(() => decodeLogoDataUrl(dataUrl("image/png", big))).toThrow(
      expect.objectContaining({ code: "logoUnreadable" })
    );
  });
});

describe("the logo route", () => {
  it("is the loopback URL of the job", () => {
    expect(logoAssetUrl(8080, "abc")).toBe(
      "http://127.0.0.1:8080/assets/abc/logo"
    );
    expect(matchLogoAssetPath("/assets/abc/logo")).toBe("abc");
    expect(matchLogoAssetPath("/assets/abc/other")).toBeNull();
    expect(matchLogoAssetPath("/assets//logo")).toBeNull();
  });

  it("is served to loopback peers only", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("10.0.0.2")).toBe(false);
    expect(isLoopback(null)).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it("an older attempt's cleanup leaves a newer attempt's logo", () => {
    const assets = createLogoAssets();
    assets.set("job", { contentType: "image/png", path: "/tmp/job-2/logo" });
    assets.remove("job", "/tmp/job-1/logo");
    expect(assets.get("job")?.path).toBe("/tmp/job-2/logo");
    assets.remove("job", "/tmp/job-2/logo");
    expect(assets.get("job")).toBeNull();
  });
});
