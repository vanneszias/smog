import {
  Content as TooltipPrimitiveContent,
  Portal as TooltipPrimitivePortal,
  Provider as TooltipPrimitiveProvider,
  Root as TooltipPrimitiveRoot,
  Trigger as TooltipPrimitiveTrigger,
} from "@radix-ui/react-tooltip";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Exported for an app that wants one shared delay across a whole page: mount
 * it once at the root and every `Tooltip` under it inherits the timing.
 */
export const TooltipProvider = TooltipPrimitiveProvider;

export type TooltipProps = ComponentPropsWithoutRef<
  typeof TooltipPrimitiveRoot
>;

/**
 * The tooltip root, with its own provider.
 *
 * `Tooltip.Root` throws without a `Tooltip.Provider` above it — Radix reads
 * the delay out of provider context and its `createContextScope` consumer has
 * no default — so a bare primitive turns a single tooltip on a page into a
 * runtime error. Bringing the provider along makes one-off tooltips work and
 * costs nothing: nesting is allowed, and an app-level `TooltipProvider`
 * around the page still governs anything this root does not set for itself.
 *
 * Both roots are `React.FC`, so there is no ref to forward here.
 */
export const Tooltip = ({ children, ...props }: TooltipProps) => (
  <TooltipPrimitiveProvider>
    <TooltipPrimitiveRoot {...props}>{children}</TooltipPrimitiveRoot>
  </TooltipPrimitiveProvider>
);

Tooltip.displayName = "Tooltip";

export const TooltipTrigger = TooltipPrimitiveTrigger;

/**
 * Inverted surface: `bg-foreground text-background`. A tooltip has to read as
 * a layer above everything, and inverting the one pair the token set already
 * guarantees at AA gets that for free in both themes.
 */
export const tooltipContentVariants = cva(
  "z-50 max-w-xs rounded-md bg-foreground px-3 py-2 text-background text-sm shadow-md"
);

export type TooltipContentProps = ComponentPropsWithoutRef<
  typeof TooltipPrimitiveContent
>;

export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitivePortal>
      <TooltipPrimitiveContent
        className={cn(tooltipContentVariants(), className)}
        ref={ref}
        sideOffset={sideOffset}
        {...props}
      />
    </TooltipPrimitivePortal>
  )
);

TooltipContent.displayName = "TooltipContent";
