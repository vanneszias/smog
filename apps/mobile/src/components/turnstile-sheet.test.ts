import { describe, expect, it } from "@jest/globals";
import { allowBridgeLoad, parseBridgeMessage } from "./turnstile-sheet";

const SITE = "https://smog.test";
const URL = `${SITE}/turnstile-bridge?lang=nl`;

const message = (data: unknown, url = URL) => ({
  data: typeof data === "string" ? data : JSON.stringify(data),
  url,
});

describe("parseBridgeMessage", () => {
  it("reads the token, errors and expiry from the site", () => {
    expect(
      parseBridgeMessage(
        message({ source: "smog-turnstile", token: "t", type: "token" }),
        SITE
      )
    ).toEqual({ token: "t", type: "token" });
    expect(
      parseBridgeMessage(
        message({ source: "smog-turnstile", type: "error" }),
        SITE
      )
    ).toEqual({ type: "error" });
    expect(
      parseBridgeMessage(
        message({ source: "smog-turnstile", type: "expired" }),
        SITE
      )
    ).toEqual({ type: "expired" });
  });

  it.each([
    [
      "another origin",
      message(
        { source: "smog-turnstile", token: "t", type: "token" },
        "https://evil.test/"
      ),
    ],
    [
      "a look-alike host",
      message(
        { source: "smog-turnstile", token: "t", type: "token" },
        "https://smog.test.evil.test/"
      ),
    ],
    [
      "http instead of https",
      message(
        { source: "smog-turnstile", token: "t", type: "token" },
        "http://smog.test/"
      ),
    ],
    [
      "no url",
      message({ source: "smog-turnstile", token: "t", type: "token" }, ""),
    ],
    ["not JSON", message("token")],
    ["JSON null", message("null")],
    ["another source", message({ source: "other", token: "t", type: "token" })],
    ["no token", message({ source: "smog-turnstile", type: "token" })],
    [
      "an empty token",
      message({ source: "smog-turnstile", token: "", type: "token" }),
    ],
    [
      "a number token",
      message({ source: "smog-turnstile", token: 1, type: "token" }),
    ],
    [
      "an oversized token",
      message({
        source: "smog-turnstile",
        token: "x".repeat(5000),
        type: "token",
      }),
    ],
    ["an unknown type", message({ source: "smog-turnstile", type: "cookie" })],
  ])("ignores %s", (_label, event) => {
    expect(parseBridgeMessage(event, SITE)).toBeNull();
  });
});

describe("allowBridgeLoad", () => {
  it("allows the site on top and Cloudflare's challenge in frames", () => {
    expect(allowBridgeLoad({ isTopFrame: true, url: URL }, SITE)).toBe(true);
    expect(allowBridgeLoad({ url: URL }, SITE)).toBe(true);
    expect(
      allowBridgeLoad(
        { isTopFrame: false, url: "https://challenges.cloudflare.com/x" },
        SITE
      )
    ).toBe(true);
  });

  it("refuses everything else", () => {
    expect(
      allowBridgeLoad(
        { isTopFrame: true, url: "https://challenges.cloudflare.com/x" },
        SITE
      )
    ).toBe(false);
    expect(allowBridgeLoad({ url: "https://evil.test/" }, SITE)).toBe(false);
    expect(allowBridgeLoad({ url: "smog://sign-in" }, SITE)).toBe(false);
    expect(allowBridgeLoad({ url: "not a url" }, SITE)).toBe(false);
    expect(
      allowBridgeLoad({ isTopFrame: false, url: "https://evil.test/" }, SITE)
    ).toBe(false);
  });
});
