import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./kitchen-sink.css";

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

export default function KitchenSinkLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">{children}</div>
  );
}
