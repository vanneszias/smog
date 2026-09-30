const TRAILING_SLASHES = /\/+$/;

/** `SITE_URL` without its trailing slash, so `${origin}${path}` is one slash. */
export function siteOrigin(siteUrl: string): string {
  return siteUrl.replace(TRAILING_SLASHES, "");
}
