import { describe, expect, it } from "bun:test";
import { MUX_DEFAULT_API_URL } from "@smog/config/env/worker";
import { isAllowedUploadUrl } from "./urls";

describe("isAllowedUploadUrl", () => {
  it("allows https on a mux.com subdomain (what the CSP connect-src allows)", () => {
    expect(
      isAllowedUploadUrl(
        "https://direct-uploads.oci-us-ashburn-1-vop1.production.mux.com/upload/x?sig=1",
        MUX_DEFAULT_API_URL
      )
    ).toBe(true);
  });

  it("refuses other hosts, http, and lookalikes against the real API", () => {
    for (const url of [
      "https://storage.googleapis.com/video-storage-us-east1-uploads/x",
      "http://direct-uploads.production.mux.com/upload/x",
      "https://mux.com.evil.test/upload/x",
      "https://evilmux.com/upload/x",
      "http://localhost:4010/upload/x",
      "not a url",
    ]) {
      expect(isAllowedUploadUrl(url, MUX_DEFAULT_API_URL), url).toBe(false);
    }
  });

  it("allows a fake Mux's own origin, only when MUX_API_URL points at it", () => {
    const fake = "http://localhost:4010";
    expect(isAllowedUploadUrl(`${fake}/upload/x`, fake)).toBe(true);
    expect(isAllowedUploadUrl("http://localhost:9999/upload/x", fake)).toBe(
      false
    );
  });
});
