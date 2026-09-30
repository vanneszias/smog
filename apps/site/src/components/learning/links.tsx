import type { KitLinkProps } from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** The gesture page of a slug. */
export function gestureHref(slug: string): string {
  return `/gestures/${encodeURIComponent(slug)}`;
}

/**
 * The kit's `linkComponent`: a router link, so cards and rows navigate in
 * the app (and preload on intent) instead of reloading the page.
 */
export function RouterLink({
  children,
  className,
  href,
}: KitLinkProps): ReactNode {
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
}
