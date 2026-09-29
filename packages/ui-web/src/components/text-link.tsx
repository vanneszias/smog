import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { focusRing, hitArea, transition } from "../lib/variants";

export const textLinkVariants = cva(
  [
    "rounded-sm font-medium underline-offset-4 hover:underline",
    // Inline in a sentence: the text stays put, the target grows to 44 px.
    hitArea,
    focusRing,
    transition,
  ],
  {
    defaultVariants: { tone: "primary" },
    variants: {
      tone: {
        default: "text-foreground",
        muted: "text-foreground-muted hover:text-foreground",
        primary: "text-primary-strong",
      },
    },
  }
);

export interface TextLinkProps
  extends ComponentProps<"a">,
    VariantProps<typeof textLinkVariants> {
  /**
   * Render the single child (a router `Link`) with the link styles instead
   * of an `<a>`.
   */
  asChild?: boolean;
}

/**
 * A link inside or next to text: `primary | default | muted`, the spec's
 * focus ring and a 44 px hit area. `asChild` styles a router link.
 */
export function TextLink({
  asChild = false,
  className,
  tone,
  ...props
}: TextLinkProps): ReactNode {
  const Component = asChild ? Slot.Root : "a";
  return (
    <Component
      className={cn(textLinkVariants({ tone }), className)}
      {...props}
    />
  );
}
