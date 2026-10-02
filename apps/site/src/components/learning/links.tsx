import type { GestureViewSource } from "@smog/analytics/schema";
import type { KitLinkProps } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

/**
 * The gesture page of a slug. `from` says where it is opened from, for
 * `gesture_viewed` (`?from=`, as mobile's route param); `direct` adds none.
 */
export function gestureHref(slug: string, from?: GestureViewSource): string {
  const path = `/gestures/${encodeURIComponent(slug)}`;
  return from && from !== "direct" ? `${path}?from=${from}` : path;
}

/**
 * The kit's `linkComponent`: a router link, so cards and rows navigate in
 * the app (and preload on intent) instead of reloading the page. A query
 * string in `href` becomes the link's search params.
 */
export function RouterLink({
  children,
  className,
  href,
}: KitLinkProps): ReactNode {
  const [to, query] = href.split("?", 2);
  const search = useMemo(
    () => (query ? Object.fromEntries(new URLSearchParams(query)) : {}),
    [query]
  );
  return (
    // `to` is a runtime string, so the router cannot type its search params.
    <Link className={className} search={search as never} to={to}>
      {children}
    </Link>
  );
}
