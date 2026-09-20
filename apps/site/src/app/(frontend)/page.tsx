import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/locale";

/**
 * `/` is not a page; it is a signpost to `/nl`.
 *
 * Every public URL carries its locale, the default included. That costs this
 * one redirect and buys a URL whose meaning does not depend on a cookie —
 * which matters because share links get pasted between people whose browsers
 * disagree, and because a crawler that sees one `/gestures` and one
 * `/nl/gestures` sees duplicate content.
 *
 * Negotiating the locale from `Accept-Language` here was considered and
 * rejected for now: it makes `/` uncacheable and makes the destination of a
 * link depend on who clicks it. `redirect()` issues a 307, so nothing is
 * cached permanently and a later change of mind costs nothing.
 */
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
