import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteDocument } from "@/components/SiteDocument";

/**
 * `noindex` as well as the production guard in `page.tsx`.
 *
 * The guard is what actually keeps this off the public site; this is what
 * keeps a crawler that reaches a preview deployment from listing it. Two
 * cheap mechanisms rather than one, because an unlinked page is still a
 * crawlable page.
 */
export const metadata: Metadata = {
  description:
    "Every component in @smog/ui-web, in every state, in both themes.",
  robots: { follow: false, index: false },
  title: "Kitchen sink — SMOG design system",
};

/**
 * `lang="en"` because this page is written in English and is for whoever is
 * reviewing the component library, not for a reader of the site. It renders
 * its own document because the `(frontend)` root layout is a pass-through —
 * see `SiteDocument` for why.
 */
export default function KitchenSinkLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SiteDocument lang="en">
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </SiteDocument>
  );
}
