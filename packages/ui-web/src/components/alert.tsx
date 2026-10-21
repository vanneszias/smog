import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * The registry alert with the kit's status tones: the text is the `*-strong`
 * shade on its `*-subtle` tint (the documented contrast pairs).
 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-2xl px-4 py-3 text-left text-body-sm ring-1 ring-foreground/10 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 has-data-[slot=alert-action]:pr-18 *:[svg:not([class*='size-'])]:size-4 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        danger: "bg-danger-subtle text-danger-strong ring-danger/30",
        default: "bg-card text-card-foreground",
        success: "bg-success-subtle text-success-strong ring-success/30",
        warning: "bg-warning-subtle text-warning-strong ring-warning/30",
      },
    },
  }
);

export interface AlertProps
  extends ComponentProps<"div">,
    VariantProps<typeof alertVariants> {}

/**
 * An inline message: `default | success | warning | danger`. `danger` is
 * `role="alert"` (assertive); the others are a polite `status`. Pass `role`
 * to override.
 */
export function Alert({
  className,
  role,
  variant,
  ...props
}: AlertProps): ReactNode {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      data-variant={variant ?? "default"}
      role={role ?? (variant === "danger" ? "alert" : "status")}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "font-medium text-body group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3",
        className
      )}
      data-slot="alert-title"
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "text-balance text-foreground group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4",
        className
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

export function AlertAction({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn("absolute top-2.5 right-3", className)}
      data-slot="alert-action"
      {...props}
    />
  );
}
