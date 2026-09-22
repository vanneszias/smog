import { API_BASE_URL } from "@/lib/api";
import type { Locale } from "@/lib/locale";

/**
 * The site's own privacy policy. `API_BASE_URL` is the site's origin — the
 * Payload REST API is mounted under `/api` on the same Worker (`payloadFetch`
 * in `lib/api.ts` appends that prefix itself; `API_BASE_URL` never carries
 * it) — so the page lives beside it, per locale. The EN and FR versions are
 * unreviewed drafts that say so at the top; that is the site's concern, not
 * this link's.
 */
export function privacyPolicyUrl(locale: Locale): string {
  return `${API_BASE_URL}/${locale}/privacy`;
}
