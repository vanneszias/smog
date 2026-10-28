import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";
const NONCE = /'nonce-([A-Za-z0-9+/=]+)'/;
const SCRIPT_TAG = /<script\b[^>]*>/g;

async function bridge(query = "", headers: Record<string, string> = {}) {
  return await exports.default.fetch(`${ORIGIN}/turnstile-bridge${query}`, {
    headers,
  });
}

describe("GET /turnstile-bridge", () => {
  it("serves the widget page with a CSP of its own", async () => {
    const response = await bridge();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    const csp = response.headers.get("content-security-policy") ?? "";
    for (const directive of [
      "default-src 'none'",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");

    // Every executable script carries this response's nonce.
    const nonce = csp.match(NONCE)?.[1];
    expect(nonce).toBeTruthy();
    const html = await response.text();
    const tags = html.match(SCRIPT_TAG) ?? [];
    const executable = tags.filter((tag) => !tag.includes("application/json"));
    expect(executable.length).toBeGreaterThan(0);
    for (const tag of executable) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
  });

  it("uses a fresh nonce per response", async () => {
    const first = (await bridge()).headers.get("content-security-policy");
    const second = (await bridge()).headers.get("content-security-policy");
    expect(first?.match(NONCE)?.[1]).not.toBe(second?.match(NONCE)?.[1]);
  });

  it("posts only to the React Native WebView bridge", async () => {
    const html = await (await bridge()).text();
    expect(html).toContain("window.ReactNativeWebView");
    expect(html).not.toContain("parent.postMessage");
    expect(html).not.toContain("opener");
    expect(html).not.toContain('postMessage(message, "*")');
  });

  it("dev without a site key uses Cloudflare's always-pass test key", async () => {
    const html = await (await bridge()).text();
    expect(html).toContain("1x00000000000000000000AA");
  });

  it("speaks the language the app asks for, else the request's", async () => {
    expect(await (await bridge("?lang=en")).text()).toContain('lang="en"');
    expect(
      await (await bridge("", { "accept-language": "fr-BE" })).text()
    ).toContain('lang="fr"');
    expect(await (await bridge("?lang=de")).text()).toContain('lang="nl"');
    expect(
      await (
        await bridge("", {
          "accept-language": "fr",
          cookie: "theme=dark; locale=en",
        })
      ).text()
    ).toContain('lang="en"');
  });

  it("escapes the embedded config so it cannot close its script", async () => {
    const html = await (await bridge()).text();
    const config = html.slice(
      html.indexOf('type="application/json"'),
      html.indexOf("</script>", html.indexOf('type="application/json"'))
    );
    expect(config).not.toContain("<");
  });
});
