import type { ReactNode } from "react";

/**
 * A pass-through, deliberately.
 *
 * `<html>` normally lives in the root layout, but its `lang` attribute has to
 * name the locale of the page and this layout sits above the `[locale]`
 * segment — route groups create no segment, so it receives no params and
 * cannot know. The document therefore moves down to the layouts that do know
 * (see `SiteDocument`), and this file only exists because every page needs a
 * root layout above it.
 *
 * Next's "missing `<html>` and `<body>` tags in the root layout" check reads
 * the rendered stream rather than this module
 * (`createRootLayoutValidatorStream`, verified in `next@16.3.3`), so a
 * pass-through is fine as long as everything below paints a document. The one
 * route under this group that renders no document is `/`, which redirects
 * before it renders anything at all.
 */
export default function FrontendLayout({ children }: { children: ReactNode }) {
  return children;
}
