/**
 * Mux URLs. The playback helpers (`muxStreamUrl`, `muxThumbnailUrl`) stay
 * in `@smog/utils`: the UI kits import them from there.
 */

import { MUX_DEFAULT_API_URL } from "@smog/config/env/worker";

const MUX_HOST = /\.mux\.com$/;
const TRAILING_SLASHES = /\/+$/;

/**
 * Whether the browser may PUT to this direct-upload URL: https on a
 * `*.mux.com` host (Mux moved uploads off storage.googleapis.com in 2025),
 * which the CSP `connect-src` allows. A fake Mux (`apiUrl` not the
 * default) may also hand out URLs on its own origin.
 */
export function isAllowedUploadUrl(url: string, apiUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:" && MUX_HOST.test(parsed.hostname)) {
    return true;
  }
  return (
    apiUrl.replace(TRAILING_SLASHES, "") !== MUX_DEFAULT_API_URL &&
    parsed.origin === new URL(apiUrl).origin
  );
}
