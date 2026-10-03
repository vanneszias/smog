import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES } from "../src/schema/wizard";
import {
  LOGO_UPLOAD_TTL_MS,
  logoUploadUrl,
  signLogoUpload,
  sniffLogoType,
  verifyLogoObject,
  verifyLogoUpload,
} from "../src/server/logo";
import { callAt, SITE_URL } from "./helpers";
import { GIF, JPEG, media, PNG, putLogo, WEBP } from "./logos";

const SECRET = "rpc-test-secret-at-least-32-characters";
const NOW = 1_790_000_000_000;
const KEY = "logos/00000000-0000-4000-8000-000000000001";
const LOGO_KEY = /^logos\/[0-9a-f-]{36}$/;

const R2 = {
  MEDIA_BUCKET: "smog-test-media",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
};

interface UploadAnswer {
  expiresAt: number;
  headers: { "content-type": string };
  key: string;
  uploadUrl: string;
}

describe("sniffLogoType (ruling 10, the magic bytes)", () => {
  it("knows PNG, JPEG and WebP", () => {
    expect(sniffLogoType(PNG)).toBe("image/png");
    expect(sniffLogoType(JPEG)).toBe("image/jpeg");
    expect(sniffLogoType(WEBP)).toBe("image/webp");
  });

  it("refuses a GIF, an empty file and a short one", () => {
    expect(sniffLogoType(GIF)).toBeNull();
    expect(sniffLogoType(new Uint8Array(0))).toBeNull();
    expect(sniffLogoType(PNG.slice(0, 4))).toBeNull();
  });
});

describe("the signed fallback upload URL", () => {
  it("verifies its own signature until it expires", async () => {
    const expiresAt = NOW + LOGO_UPLOAD_TTL_MS;
    const signature = await signLogoUpload(SECRET, {
      contentType: "image/png",
      expiresAt,
      key: KEY,
    });
    const check = (overrides: Record<string, unknown>) =>
      verifyLogoUpload(SECRET, {
        contentType: "image/png",
        expiresAt,
        key: KEY,
        now: NOW,
        signature,
        ...overrides,
      });
    expect(await check({})).toBe("ok");
    expect(await check({ now: expiresAt + 1 })).toBe("expired");
    expect(await check({ contentType: "image/jpeg" })).toBe("invalid");
    expect(
      await check({ key: "logos/00000000-0000-4000-8000-000000000002" })
    ).toBe("invalid");
    expect(await check({ expiresAt: expiresAt + 60_000 })).toBe("invalid");
    expect(await check({ signature: `${signature.slice(0, -2)}AA` })).toBe(
      "invalid"
    );
    expect(await check({ signature: "not base64url!" })).toBe("invalid");
    expect(
      await verifyLogoUpload("another-secret-at-least-32-characters!!", {
        contentType: "image/png",
        expiresAt,
        key: KEY,
        now: NOW,
        signature,
      })
    ).toBe("invalid");
  });

  it("is a same-origin PUT with exp and sig when there are no R2 tokens", async () => {
    const answer = await logoUploadUrl(
      { BETTER_AUTH_SECRET: SECRET, SITE_URL },
      { contentType: "image/webp", key: KEY, now: NOW }
    );
    const url = new URL(answer.uploadUrl);
    expect(url.origin).toBe(SITE_URL);
    expect(url.pathname).toBe(
      "/api/logos/upload/00000000-0000-4000-8000-000000000001"
    );
    expect(url.searchParams.get("exp")).toBe(String(NOW + LOGO_UPLOAD_TTL_MS));
    expect(answer).toMatchObject({
      expiresAt: NOW + LOGO_UPLOAD_TTL_MS,
      headers: { "content-type": "image/webp" },
      key: KEY,
    });
    expect(
      await verifyLogoUpload(SECRET, {
        contentType: "image/webp",
        expiresAt: NOW + LOGO_UPLOAD_TTL_MS,
        key: KEY,
        now: NOW,
        signature: url.searchParams.get("sig") ?? "",
      })
    ).toBe("ok");
  });

  it("is an R2 presigned PUT (300 s, Content-Type signed) with the R2 tokens", async () => {
    const answer = await logoUploadUrl(
      { BETTER_AUTH_SECRET: SECRET, SITE_URL, ...R2 },
      { contentType: "image/png", key: KEY, now: NOW }
    );
    const url = new URL(answer.uploadUrl);
    expect(url.origin).toBe(
      "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
    );
    expect(url.pathname).toBe(`/smog-test-media/${KEY}`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-type;host"
    );
    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "test-access-key/"
    );
    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "/auto/s3/aws4_request"
    );
    expect(answer.uploadUrl).not.toContain("test-secret-access-key");
    expect(answer.headers).toEqual({ "content-type": "image/png" });
  });
});

describe("sponsorships.uploadLogo", () => {
  it("answers a new logos/<uuid> key with the fallback URL", async () => {
    const answer = await callAt<UploadAnswer>("uploadLogo", {
      contentType: "image/png",
      size: 1000,
    });
    expect(answer.key).toMatch(LOGO_KEY);
    expect(answer.uploadUrl).toContain(
      `/api/logos/upload/${answer.key.slice("logos/".length)}?exp=`
    );
    expect(answer.headers).toEqual({ "content-type": "image/png" });
    expect(answer.expiresAt).toBeGreaterThan(Date.now());
  });

  it("answers the presigned URL when the R2 tokens are set", async () => {
    const answer = await callAt<UploadAnswer>(
      "uploadLogo",
      { contentType: "image/jpeg", size: 1000 },
      { env: R2 }
    );
    expect(new URL(answer.uploadUrl).hostname).toBe(
      "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
    );
  });

  it("refuses a GIF and a file over 2 MiB before signing anything", async () => {
    await expect(
      callAt("uploadLogo", { contentType: "image/gif", size: 1000 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callAt("uploadLogo", {
        contentType: "image/png",
        size: LOGO_MAX_BYTES + 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("verifyLogoObject (the checkout's check, bug 23)", () => {
  it("accepts a stored PNG, JPEG and WebP", async () => {
    expect(await verifyLogoObject(media(), await putLogo(PNG))).toBe(true);
    expect(
      await verifyLogoObject(media(), await putLogo(JPEG, "image/jpeg"))
    ).toBe(true);
    expect(
      await verifyLogoObject(media(), await putLogo(WEBP, "image/webp"))
    ).toBe(true);
  });

  it("refuses and deletes a mismatched type, a renamed GIF and a file over 2 MiB", async () => {
    const mismatched = await putLogo(JPEG, "image/png");
    const gif = await putLogo(GIF, "image/png");
    const gifType = await putLogo(GIF, "image/gif");
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    const large = await putLogo(big);
    for (const key of [mismatched, gif, gifType, large]) {
      // biome-ignore lint/performance/noAwaitInLoops: one check per fixture, in order.
      expect(await verifyLogoObject(media(), key)).toBe(false);
      expect(await media().head(key)).toBeNull();
    }
  });

  it("refuses a key that does not exist", async () => {
    expect(
      await verifyLogoObject(
        media(),
        "logos/00000000-0000-4000-8000-0000000000ff"
      )
    ).toBe(false);
  });
});
