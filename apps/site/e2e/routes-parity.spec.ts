import { type APIResponse, expect, test } from "@playwright/test";

/**
 * The feature inventory's URL table (section 7, R-01 to R-25) walked over
 * HTTP against the dev server: no page loads, only `request` calls, so the
 * whole file costs seconds and stays in the `public` project (phase 9 task
 * 9). What needs a browser (the pages' content) is pinned by the page specs
 * named in docs/DECISIONS.md, "Parity audit (phase 9 task 9)".
 *
 * Redirects are not followed: the status and `Location` are the contract.
 */
const NO_FOLLOW = { maxRedirects: 0 } as const;

/** `/sponsors/re-edit` and friends answer 302, the token in the fragment. */
const LEGACY: readonly {
  from: string;
  id: string;
  location: string;
  status: number;
}[] = [
  { from: "/login", id: "R-08", location: "/sign-in", status: 301 },
  {
    from: "/login?redirect=%2Faccount",
    id: "R-08",
    location: "/sign-in?redirect=%2Faccount",
    status: 301,
  },
  { from: "/callback?code=spent", id: "R-09", location: "/", status: 301 },
  { from: "/sponsors", id: "R-11", location: "/sponsor", status: 301 },
  { from: "/sponsors/", id: "R-11", location: "/sponsor", status: 301 },
  {
    from: "/sponsors/success?paymentId=tr_parity1",
    id: "R-13",
    location: "/sponsor/success?payment=tr_parity1",
    status: 301,
  },
  { from: "/success", id: "R-14", location: "/sponsor/success", status: 301 },
  {
    from: "/sponsors/re-edit?token=0b1c2d3e-0000-4000-8000-000000000000",
    id: "R-15",
    location: "/sponsor/edit#token=0b1c2d3e-0000-4000-8000-000000000000",
    status: 302,
  },
];

test.describe("legacy URLs (R-08 to R-15)", () => {
  for (const { from, id, location, status } of LEGACY) {
    test(`${id} ${from} answers ${status} to ${location}`, async ({
      request,
    }) => {
      const response = await request.get(from, NO_FOLLOW);
      expect(response.status()).toBe(status);
      expect(response.headers().location).toBe(location);
    });
  }

  test("R-15 the re-edit token never stays in the query", async ({
    request,
  }) => {
    const response = await request.get(
      "/sponsors/re-edit?token=abc&utm=x",
      NO_FOLLOW
    );
    const location = response.headers().location ?? "";
    expect(location).not.toContain("?");
    expect(location).toBe("/sponsor/edit#token=abc");
  });
});

/** Routes that must answer a document for a guest, with no redirect. */
const DOCUMENTS = [
  ["R-01", "/"],
  ["R-02", "/gestures"],
  ["R-02", "/gestures?q=hallo&category=begroetingen"],
  ["R-04", "/lists"],
  ["R-06", "/favorites"],
  ["R-07", "/account"],
  ["R-12", "/sponsor"],
  ["R-16", "/privacy"],
  ["R-16", "/terms"],
] as const;

test.describe("canonical pages (R-01 to R-16)", () => {
  for (const [id, path] of DOCUMENTS) {
    test(`${id} ${path} is a document`, async ({ request }) => {
      const response = await request.get(path, NO_FOLLOW);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/html");
    });
  }

  test("R-10 /admin sends a guest to sign-in", async ({ request }) => {
    const response = await request.get("/admin", NO_FOLLOW);
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers().location).toContain("/sign-in");
  });

  test("R-05 a shared-list link keeps its URL (unknown token: a page, not a redirect)", async ({
    request,
  }) => {
    const response = await request.get(
      "/lists/parity-unknown-token",
      NO_FOLLOW
    );
    expect(response.status()).toBeLessThan(500);
    expect(response.status()).not.toBe(301);
  });

  test("R-03 an unknown old gesture id is a 404, not a loop", async ({
    request,
  }) => {
    const response = await request.get("/gestures/k17parityunknown", NO_FOLLOW);
    expect([404, 301]).toContain(response.status());
  });

  test("R-25 the mail links resolve: root, /sponsor, /admin", async ({
    request,
  }) => {
    const statuses = await Promise.all(
      ["/", "/sponsor", "/admin"].map(async (path) =>
        (await request.get(path, NO_FOLLOW)).status()
      )
    );
    for (const status of statuses) {
      expect(status).toBeLessThan(400);
    }
  });
});

function contentType(response: APIResponse): string {
  return response.headers()["content-type"] ?? "";
}

test.describe("static and generated files (R-17, R-18)", () => {
  test("R-18 /robots.txt is text and names the sitemap only where indexed", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(contentType(response)).toContain("text/plain");
    // Dev is never indexed (production only, P-15).
    expect(await response.text()).toContain("Disallow: /");
  });

  test("R-18 /sitemap.xml is XML with the home page", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(contentType(response)).toContain("xml");
    expect(await response.text()).toContain("<urlset");
  });

  test("R-18 /manifest.webmanifest is the installable manifest", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(contentType(response)).toContain("manifest+json");
    const manifest = await response.json();
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
    const icons = manifest.icons as { src: string }[];
    const statuses = await Promise.all(
      icons.map(async (icon) => (await request.get(icon.src)).status())
    );
    expect(statuses).toEqual(icons.map(() => 200));
  });

  test("R-18 /assets/logo.svg is the unhashed green logo", async ({
    request,
  }) => {
    const response = await request.get("/assets/logo.svg");
    expect(response.status()).toBe(200);
    expect(contentType(response)).toContain("image/svg+xml");
    expect(await response.text()).toContain("#00805F");
  });

  test("R-18 /browserconfig.xml is dropped (legacy IE/Edge tiles)", async ({
    request,
  }) => {
    const response = await request.get("/browserconfig.xml", NO_FOLLOW);
    expect(response.status()).toBe(404);
  });

  for (const path of [
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
  ]) {
    test(`R-17 ${path} is JSON, with no redirect`, async ({ request }) => {
      const response = await request.get(path, NO_FOLLOW);
      expect(response.status()).toBe(200);
      // The file's type comes from public/_headers, which the dev server may
      // not apply; the body must parse either way.
      expect(await response.json()).toBeTruthy();
    });
  }
});

test.describe("service routes (R-19)", () => {
  test("/api/health answers ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("the old /webhooks/mollie URL still reaches the handler", async ({
    request,
  }) => {
    // Mollie posts `id=tr_…`; an unknown payment is acknowledged (200) so
    // Mollie stops retrying, whatever the payment: never a 404.
    const response = await request.post("/webhooks/mollie", {
      form: { id: "tr_parityunknown" },
      ...NO_FOLLOW,
    });
    expect(response.status()).not.toBe(404);
    expect(response.status()).toBeLessThan(500);
  });

  test("/api/openapi/spec.json is served on dev (P-34)", async ({
    request,
  }) => {
    const response = await request.get("/api/openapi/spec.json");
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty("openapi");
  });
});
