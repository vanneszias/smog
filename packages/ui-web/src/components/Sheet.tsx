import {
  Close as SheetPrimitiveClose,
  Content as SheetPrimitiveContent,
  Description as SheetPrimitiveDescription,
  Portal as SheetPrimitivePortal,
  Root as SheetPrimitiveRoot,
  Title as SheetPrimitiveTitle,
  Trigger as SheetPrimitiveTrigger,
} from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type HTMLAttributes,
} from "react";
import { cn } from "../lib/cn";
import { DialogOverlay } from "./Dialog";

/**
 * A side-anchored dialog.
 *
 * It is `@radix-ui/react-dialog` underneath — same role, same focus trap,
 * same Escape handling — differing only in where the panel sits. It exists
 * as its own component because the mobile navigation and the filter panel
 * both need an edge-anchored surface, and a centred dialog is wrong for both.
 *
 * The scrim is `DialogOverlay`, shared rather than copied: two scrims that
 * drift apart is exactly the kind of difference nobody notices until they are
 * side by side.
 */
export const Sheet = SheetPrimitiveRoot;
export const SheetTrigger = SheetPrimitiveTrigger;
export const SheetPortal = SheetPrimitivePortal;
export const SheetClose = SheetPrimitiveClose;

/**
 * Border role: `border-subtle`, as for every popup edge. The panel meets the
 * page along one side only, and the scrim and shadow already mark it.
 */
export const sheetContentVariants = cva(
  "fixed z-50 flex flex-col gap-4 overflow-y-auto border-border-subtle bg-surface-raised p-6 text-foreground shadow-lg focus:outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[90dvh] border-b",
        right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
        bottom: "inset-x-0 bottom-0 max-h-[90dvh] border-t",
        left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
      },
    },
    defaultVariants: { side: "right" },
  }
);

export type SheetContentProps = ComponentPropsWithoutRef<
  typeof SheetPrimitiveContent
> &
  VariantProps<typeof sheetContentVariants> & {
    /** The close button's accessible name. */
    closeLabel?: string;
    /** Set false for a panel that must be resolved through its own buttons. */
    showClose?: boolean;
  };

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(
  (
    {
      className,
      children,
      side,
      closeLabel = "Sluiten",
      showClose = true,
      ...props
    },
    ref
  ) => (
    <SheetPrimitivePortal>
      <DialogOverlay />
      <SheetPrimitiveContent
        className={cn(sheetContentVariants({ side }), className)}
        ref={ref}
        {...props}
      >
        {children}
        {showClose ? (
          <SheetPrimitiveClose className="absolute top-4 right-4 rounded-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitiveClose>
        ) : null}
      </SheetPrimitiveContent>
    </SheetPrimitivePortal>
  )
);

SheetContent.displayName = "SheetContent";

export type SheetHeaderProps = HTMLAttributes<HTMLDivElement>;

export const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("flex flex-col gap-2", className)}
      ref={ref}
      {...props}
    />
  )
);

SheetHeader.displayName = "SheetHeader";

export type SheetFooterProps = HTMLAttributes<HTMLDivElement>;

export const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

SheetFooter.displayName = "SheetFooter";

export type SheetTitleProps = ComponentPropsWithoutRef<
  typeof SheetPrimitiveTitle
>;

export const SheetTitle = forwardRef<HTMLHeadingElement, SheetTitleProps>(
  ({ className, ...props }, ref) => (
    <SheetPrimitiveTitle
      className={cn("font-semibold text-foreground text-lg", className)}
      ref={ref}
      {...props}
    />
  )
);

SheetTitle.displayName = "SheetTitle";

export type SheetDescriptionProps = ComponentPropsWithoutRef<
  typeof SheetPrimitiveDescription
>;

export const SheetDescription = forwardRef<
  HTMLParagraphElement,
  SheetDescriptionProps
>(({ className, ...props }, ref) => (
  <SheetPrimitiveDescription
    className={cn("text-foreground-muted text-sm", className)}
    ref={ref}
    {...props}
  />
));

SheetDescription.displayName = "SheetDescription";
