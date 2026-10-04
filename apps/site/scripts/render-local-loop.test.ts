import { describe, expect, it } from "bun:test";
import { cookieHeader, devMailOf, renderAssetOf } from "./render-local-loop";

describe("cookieHeader", () => {
  it("keeps each cookie's name and value, without attributes", () => {
    expect(
      cookieHeader([
        "better-auth.session_token=abc.def; Path=/; HttpOnly; SameSite=Lax",
        "smog_mx=1; Max-Age=60",
      ])
    ).toBe("better-auth.session_token=abc.def; smog_mx=1");
  });

  it("is empty without cookies", () => {
    expect(cookieHeader([])).toBe("");
  });
});

describe("devMailOf", () => {
  it("keeps a stored mailbox (a JSON list) and reads anything else as none", () => {
    expect(devMailOf('[{"to":"a@b.c"}]\n')).toBe('[{"to":"a@b.c"}]');
    expect(devMailOf("Value not found\n")).toBeNull();
    expect(devMailOf("")).toBeNull();
  });
});

describe("renderAssetOf", () => {
  const asset = (passthrough: string | null, status = "ready") => ({
    file: new Uint8Array([1]),
    id: `asset-${passthrough}`,
    passthrough,
    playbackId: "p",
    status,
  });

  it("finds the job's ready render asset", () => {
    const found = renderAssetOf(
      [asset(null), asset("render-job:other"), asset("render-job:job-1")],
      "job-1"
    );
    expect(found?.id).toBe("asset-render-job:job-1");
  });

  it("ignores a gesture upload and an asset that is not ready", () => {
    expect(
      renderAssetOf(
        [asset("gesture-upload:job-1"), asset("render-job:job-1", "errored")],
        "job-1"
      )
    ).toBeNull();
  });
});
