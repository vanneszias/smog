"use client";

/* A client component: the dismiss button takes `onDismiss` as an `onClick`, and `toast` is sonner's imperative queue.
 * Why this is per file and not on the barrel: see `src/index.ts`. */

import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import {
  type ComponentProps,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { cn } from "../lib/cn";

/**
 * The queue's imperative API, re-exported so nothing outside this package has
 * to import `sonner` directly. Swapping the queue later is then one file.
 */
export { toast };

export const toastVariants = cva(
  "flex w-full items-start gap-3 rounded-md border border-border-subtle p-4 shadow-lg",
  {
    variants: {
      variant: {
        info: "bg-surface-raised text-foreground",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        danger: "bg-danger text-danger-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  }
);

export type ToastProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> &
  VariantProps<typeof toastVariants> & {
    title: ReactNode;
    description?: ReactNode;
    /** Renders a close button. Omit it for a toast that only times out. */
    onDismiss?: () => void;
    dismissLabel?: string;
  };

/**
 * One notification.
 *
 * `role="status"` — a polite live region — because a toast appears without
 * being asked for and a screen reader user gets no other signal that it did.
 * `role="alert"` would interrupt whatever is being read, which is right for a
 * failure and wrong for "opgeslagen"; props are spread last, so a caller with
 * a genuine emergency can pass `role="alert"` and win.
 *
 * This is deliberately a plain rendered component rather than something only
 * reachable through the queue: the kitchen-sink route has to be able to show
 * every variant at once, and an imperative-only toast cannot be rendered.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(
  (
    {
      className,
      variant,
      title,
      description,
      onDismiss,
      dismissLabel = "Sluiten",
      ...props
    },
    ref
  ) => (
    // biome-ignore lint/a11y/useSemanticElements: <output> takes phrasing content only, and a toast holds paragraphs and a button — the suggested element cannot legally contain what a toast is made of. A polite live region on a div is what is wanted, and that is all role="status" is.
    <div
      className={cn(toastVariants({ variant }), className)}
      ref={ref}
      role="status"
      {...props}
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description == null ? null : (
          <p className="text-sm opacity-90">{description}</p>
        )}
      </div>
      {onDismiss == null ? null : (
        <button
          aria-label={dismissLabel}
          className="ml-auto rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  )
);

Toast.displayName = "Toast";

export type ToasterProps = ComponentProps<typeof SonnerToaster>;

/**
 * The queue's mount point, styled with our tokens.
 *
 * `sonner` owns the stacking, the timers and the swipe-to-dismiss; what this
 * wrapper adds is that every toast it renders is painted from this design
 * system rather than from sonner's defaults, which is the part
 * `Toast.test.tsx` covers. A caller's own `classNames` still win, because
 * they are spread after ours.
 *
 * Sonner's `Toaster` is a plain function component, so there is no ref.
 */
export const Toaster = ({
  className,
  toastOptions,
  ...props
}: ToasterProps) => (
  <SonnerToaster
    className={cn("font-sans", className)}
    toastOptions={{
      ...toastOptions,
      classNames: {
        toast: toastVariants(),
        description: "text-sm opacity-90",
        ...toastOptions?.classNames,
      },
    }}
    {...props}
  />
);

Toaster.displayName = "Toaster";
