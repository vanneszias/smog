import {
  Close as DialogPrimitiveClose,
  Content as DialogPrimitiveContent,
  Description as DialogPrimitiveDescription,
  Overlay as DialogPrimitiveOverlay,
  Portal as DialogPrimitivePortal,
  Root as DialogPrimitiveRoot,
  Title as DialogPrimitiveTitle,
  Trigger as DialogPrimitiveTrigger,
} from "@radix-ui/react-dialog";
import { cva } from "class-variance-authority";
import { X } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";

/**
 * Radix's dialog root, portal and trigger are re-exported unwrapped.
 *
 * The root is `React.FC<DialogProps>` — no ref to forward — and the trigger
 * and close already render a `<button>` that takes ours. Wrapping them would
 * buy nothing and would leave a second set of props to keep in step.
 */
export const Dialog = DialogPrimitiveRoot;
export const DialogTrigger = DialogPrimitiveTrigger;
export const DialogPortal = DialogPrimitivePortal;
export const DialogClose = DialogPrimitiveClose;

/**
 * The scrim.
 *
 * `bg-black/60` rather than a token: a scrim is not a surface, and it has to
 * darken the page in *both* themes, so neither `foreground` (white in dark)
 * nor `background` (white in light) works. The design system has no semantic
 * role for it.
 */
export const dialogOverlayVariants = cva("fixed inset-0 z-50 bg-black/60");

export type DialogOverlayProps = ComponentPropsWithoutRef<
  typeof DialogPrimitiveOverlay
>;

export const DialogOverlay = forwardRef<HTMLDivElement, DialogOverlayProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitiveOverlay
      className={cn(dialogOverlayVariants(), className)}
      ref={ref}
      {...props}
    />
  )
);

DialogOverlay.displayName = "DialogOverlay";

/**
 * Border role: `border-subtle`. A dialog's own edge is decoration — the
 * raised surface, the shadow and the scrim behind it already say where it is
 * — which is the same call `SelectContent` makes and the opposite of the one
 * a control's edge makes. See the three roles in `packages/styles/src/tokens.ts`.
 */
export const dialogContentVariants = cva(
  "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border-subtle bg-surface-raised p-6 text-foreground shadow-lg focus:outline-none"
);

export type DialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitiveContent
> & {
  /** The close button's accessible name. */
  closeLabel?: string;
  /** Set false for a dialog that must be resolved through its own buttons. */
  showClose?: boolean;
};

/**
 * The panel, its scrim and its close button, in a portal.
 *
 * Composed here rather than left to the caller because all three are needed
 * every time and forgetting the portal is invisible until a parent gets
 * `overflow: hidden`.
 *
 * Escape and focus return come from Radix. What this component adds — and
 * what `Dialog.test.tsx` covers beyond the primitive — is the close button,
 * the overlay and the portal.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  (
    { className, children, closeLabel = "Sluiten", showClose = true, ...props },
    ref
  ) => (
    <DialogPrimitivePortal>
      <DialogOverlay />
      <DialogPrimitiveContent
        className={cn(dialogContentVariants(), className)}
        ref={ref}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitiveClose className="absolute top-4 right-4 rounded-sm text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitiveClose>
        ) : null}
      </DialogPrimitiveContent>
    </DialogPrimitivePortal>
  )
);

DialogContent.displayName = "DialogContent";

export type DialogHeaderProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn("flex flex-col gap-2", className)}
      ref={ref}
      {...props}
    />
  )
);

DialogHeader.displayName = "DialogHeader";

export type DialogFooterProps = HTMLAttributes<HTMLDivElement>;

export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

DialogFooter.displayName = "DialogFooter";

export type DialogTitleProps = ComponentPropsWithoutRef<
  typeof DialogPrimitiveTitle
>;

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitiveTitle
      className={cn("font-semibold text-foreground text-lg", className)}
      ref={ref}
      {...props}
    />
  )
);

DialogTitle.displayName = "DialogTitle";

export type DialogDescriptionProps = ComponentPropsWithoutRef<
  typeof DialogPrimitiveDescription
>;

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  DialogDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitiveDescription
    className={cn("text-foreground-muted text-sm", className)}
    ref={ref}
    {...props}
  />
));

DialogDescription.displayName = "DialogDescription";
