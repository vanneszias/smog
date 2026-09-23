import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * A persistent, non-modal notice pinned to an edge of the viewport.
 *
 * ## Why this is not a `Sheet`
 *
 * `Sheet` is `@radix-ui/react-dialog` underneath and `SheetContent` mounts
 * `<DialogOverlay />` unconditionally (`Sheet.tsx:79`), so every sheet is
 * modal: a full-page scrim, a focus trap, and `pointer-events: none` on the
 * body. That is right for a destructive confirmation and wrong for a notice.
 * A cookie banner that traps focus is a consent wall — the visitor cannot
 * read the privacy policy the banner links to without first answering the
 * banner, which is precisely the pattern regulators call out.
 *
 * So this component is deliberately plain: a positioned `<div>` with a
 * landmark role and a name. No portal, no scrim, no focus management. The
 * page underneath stays usable, and the banner is reachable in tab order
 * because it is in the document, not over it.
 *
 * ## Why `label` is required
 *
 * `role="region"` without an accessible name is not exposed as a landmark at
 * all — the name is what makes it navigable. A required prop is cheaper than
 * a lint rule nobody runs.
 */
export const bannerVariants = cva(
  "fixed inset-x-0 z-40 flex flex-col gap-3 border-border-subtle bg-surface-raised p-4 text-foreground shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-6",
  {
    variants: {
      placement: {
        bottom: "bottom-0 border-t",
        top: "top-0 border-b",
      },
    },
    defaultVariants: { placement: "bottom" },
  }
);

export type BannerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof bannerVariants> & {
    /**
     * Names the region for assistive technology. Required: an unnamed
     * landmark is not a landmark.
     */
    label: string;
  };

export function Banner({
  children,
  className,
  label,
  placement,
  ...props
}: BannerProps) {
  return (
    /*
     * `z-40`, below `Dialog`'s and `Sheet`'s `z-50`: if a modal opens while
     * this is showing, the modal is the thing being answered and the notice
     * belongs behind its scrim.
     */
    <section
      aria-label={label}
      className={cn(bannerVariants({ placement }), className)}
      {...props}
    >
      {children}
    </section>
  );
}
