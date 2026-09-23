import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * Border roles, and this component is where the distinction earns its keep.
 *
 * A static card's edge is decoration: remove it and the heading, the surface
 * and the shadow still say where the card is, so it is `border-subtle`. An
 * `interactive` card is a control — the whole rectangle is the click target —
 * and its edge is the only thing saying so, so it takes the functional
 * `border` (3:1, asserted in `@smog/styles`) and a focus ring. Both are
 * pinned by name in `Card.test.tsx`; see the three roles in
 * `packages/styles/src/tokens.ts`.
 */
export const cardVariants = cva(
  "rounded-lg bg-surface-raised text-foreground shadow-sm",
  {
    variants: {
      interactive: {
        true: "border border-border transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:shadow-md",
        false: "border border-border-subtle",
      },
    },
    defaultVariants: { interactive: false },
  }
);

export type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      className={cn(cardVariants({ interactive }), className)}
      ref={ref}
      {...props}
    />
  )
);

Card.displayName = "Card";

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("flex flex-col gap-1 p-6", className)}
      ref={ref}
      {...props}
    />
  )
);

CardHeader.displayName = "CardHeader";

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  /**
   * Render the single child element instead of an `<h3>`, so a page can put
   * the card's title at whatever heading level its outline needs.
   */
  asChild?: boolean;
};

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Component = asChild ? Slot : "h3";

    return (
      <Component
        className={cn("font-semibold text-foreground text-lg", className)}
        ref={ref}
        {...props}
      />
    );
  }
);

CardTitle.displayName = "CardTitle";

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, ...props }, ref) => (
  <p
    className={cn("text-foreground-muted text-sm", className)}
    ref={ref}
    {...props}
  />
));

CardDescription.displayName = "CardDescription";

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div className={cn("p-6 pt-0", className)} ref={ref} {...props} />
  )
);

CardContent.displayName = "CardContent";

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("flex items-center gap-2 p-6 pt-0", className)}
      ref={ref}
      {...props}
    />
  )
);

CardFooter.displayName = "CardFooter";
