/** Never crawled: admin, the API, dev tools and the account (inventory P-15). */
const DISALLOW = ["/admin", "/api/", "/dev/", "/account"] as const;
/** SEO crawlers the old site blocked (inventory P-15: "same bot rules"). */
const BLOCKED_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot"] as const;

/**
 * `robots.txt` for an environment. Only production is indexed: staging and
 * dev would be a duplicate site, so they disallow everything.
 */
export function robotsTxt({
  environment,
  origin,
}: {
  environment: string;
  /** `SITE_URL` without a trailing slash. */
  origin: string;
}): string {
  if (environment !== "production") {
    return "User-agent: *\nDisallow: /\n";
  }
  return [
    ...BLOCKED_BOTS.flatMap((bot) => [`User-agent: ${bot}`, "Disallow: /", ""]),
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}
