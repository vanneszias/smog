/**
 * The re-edit and renewal pages carry a raw token in their URL (ruling
 * 11): they send no `Referer` at all, so no request they make, same-site
 * or not, repeats the token (review I-8). The site-wide policy already
 * keeps it from other origins; this pins it for these pages.
 */
export function tokenPageHeaders(): Record<string, string> {
  return { "referrer-policy": "no-referrer" };
}

/**
 * The same as a `<meta name="referrer">`, for a page reached by a client
 * navigation (no document response, so no header).
 */
export function tokenPageHead<M extends object>(head: { meta: M[] }) {
  return {
    ...head,
    meta: [...head.meta, { content: "no-referrer", name: "referrer" }],
  };
}
