import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_LOGO } from "@smog/email/theme";
import {
  EMAIL_LOGO_PATH,
  emailLogoProblem,
  emailLogoUrl,
  type Fetcher,
  runEmailLogoCheck,
} from "../../../../../scripts/check-email-logo";

const ROOT = new URL("../../../../..", import.meta.url).pathname;
const WRANGLER = readFileSync(
  join(ROOT, "apps", "site", "wrangler.jsonc"),
  "utf8"
);
const DEPLOY = readFileSync(
  join(ROOT, ".github", "workflows", "deploy.yml"),
  "utf8"
);
const PNG = readFileSync(
  join(ROOT, "apps", "site", "public", "brand", "email-logo.png")
);
const URL_STAGING =
  "https://smog-site-staging.zias.workers.dev/brand/email-logo.png";

function fetcher(response: () => Response): {
  calls: { init: RequestInit; url: string }[];
  fetch: Fetcher;
} {
  const calls: { init: RequestInit; url: string }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ init, url });
      return Promise.resolve(response());
    },
  };
}

const png = () =>
  new Response(PNG, { headers: { "content-type": "image/png" } });
const accessLogin = () =>
  Response.redirect(
    "https://ziasbe.cloudflareaccess.com/cdn-cgi/access/login/smog-site-staging.zias.workers.dev?kid=x",
    302
  );

function logger(): { error: string[]; log: string[] } {
  return { error: [], log: [] };
}

describe("check-email-logo (issue #10)", () => {
  test("checks the path the templates load the logo from", () => {
    expect(EMAIL_LOGO_PATH).toBe(EMAIL_LOGO.path);
  });

  test("builds the URL from each env's SITE_URL", () => {
    expect(emailLogoUrl(WRANGLER, "staging")).toBe(URL_STAGING);
    expect(emailLogoUrl(WRANGLER, "production")).toBe(
      "https://smog-site-production.zias.workers.dev/brand/email-logo.png"
    );
  });

  test("passes an anonymous 200 PNG, fetched without credentials or redirects", async () => {
    const { calls, fetch } = fetcher(png);
    expect(await emailLogoProblem(URL_STAGING, fetch)).toBeNull();
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(calls[0]?.init.credentials).toBe("omit");
  });

  test("names Cloudflare Access when the logo redirects to its login", async () => {
    const problem = await emailLogoProblem(
      URL_STAGING,
      fetcher(accessLogin).fetch
    );
    expect(problem).toContain(
      "answers 302 to https://ziasbe.cloudflareaccess.com"
    );
    expect(problem).toContain("/brand/* to the Access bypass");
    expect(problem).not.toContain("kid=");
  });

  test("fails a 404, an HTML page and bytes that are not a PNG", async () => {
    const missing = () => new Response("Not Found", { status: 404 });
    const html = () =>
      new Response("<html>", { headers: { "content-type": "text/html" } });
    const fake = () =>
      new Response("<html>", { headers: { "content-type": "image/png" } });
    expect(
      await emailLogoProblem(URL_STAGING, fetcher(missing).fetch)
    ).toContain("answers 404");
    expect(await emailLogoProblem(URL_STAGING, fetcher(html).fetch)).toContain(
      "not image/png"
    );
    expect(await emailLogoProblem(URL_STAGING, fetcher(fake).fetch)).toContain(
      "PNG signature"
    );
  });

  test("production fails and staging only warns, after the retries", async () => {
    const read = () => Promise.resolve(WRANGLER);
    const production = logger();
    const blocked = fetcher(accessLogin);
    expect(
      await runEmailLogoCheck(
        ["--env", "production"],
        blocked.fetch,
        {
          error: (l) => production.error.push(l),
          log: (l) => production.log.push(l),
        },
        read,
        0
      )
    ).toBe(1);
    expect(blocked.calls.length).toBe(5);
    expect(production.error[0]).toContain("[email-logo]");

    const staging = logger();
    expect(
      await runEmailLogoCheck(
        ["--env", "staging", "--warn-only"],
        fetcher(accessLogin).fetch,
        {
          error: (l) => staging.error.push(l),
          log: (l) => staging.log.push(l),
        },
        read,
        0
      )
    ).toBe(0);
    expect(staging.log[0]).toStartWith("::warning::[email-logo]");
  });

  test("refuses --warn-only for production", async () => {
    const log = logger();
    expect(
      await runEmailLogoCheck(
        ["--env", "production", "--warn-only"],
        fetcher(png).fetch,
        { error: (l) => log.error.push(l), log: (l) => log.log.push(l) },
        () => Promise.resolve(WRANGLER),
        0
      )
    ).toBe(1);
  });

  test("deploy.yml runs it after the deploy, enforcing production", () => {
    const deploy = DEPLOY.indexOf("run: bun -F @smog/site deploy");
    const check = DEPLOY.indexOf("bun scripts/check-email-logo.ts");
    expect(deploy).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(deploy);
    expect(DEPLOY).toContain(
      'bun scripts/check-email-logo.ts --env "$CLOUDFLARE_ENV"\n'
    );
  });
});
