import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  disabled,
  focusRing,
  hitArea,
  stateLayer,
  transition,
} from "../lib/variants";
import { Spinner } from "./spinner";

const iconButtonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center rounded-full border",
    stateLayer.full,
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { size: "md", variant: "ghost" },
    variants: {
      size: {
        lg: "size-12",
        md: "size-touch",
        // Dense admin tables only; the pseudo-element keeps a 44 px target.
        sm: cn("size-8", hitArea),
      },
      variant: {
        danger: "border-transparent bg-danger text-primary-foreground",
        ghost: "border-transparent bg-transparent text-foreground",
        primary: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-foreground-muted bg-surface text-foreground",
      },
    },
  }
);

/** Sizes the icon (the span's only child). */
const ICON_SIZE = { lg: "*:size-6", md: "*:size-5", sm: "*:size-4" } as const;

export interface IconButtonProps
  extends Omit<ComponentProps<"button">, "children">,
    VariantProps<typeof iconButtonVariants> {
  /** The icon (decorative). */
  icon: ReactNode;
  /** The accessible name, from an `a11y.*` key. Required: there is no text. */
  label: string;
  loading?: boolean;
}

/** A round, icon-only button; `label` is its accessible name. */
export function IconButton({
  className,
  disabled: isDisabled,
  icon,
  label,
  loading = false,
  size,
  type,
  variant,
  ...props
}: IconButtonProps): ReactNode {
  return (
    <button
      aria-busy={loading || undefined}
      aria-label={label}
      className={cn(iconButtonVariants({ size, variant }), className)}
      disabled={isDisabled || loading}
      type={type ?? "button"}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <span
          aria-hidden="true"
          className={cn("relative inline-flex", ICON_SIZE[size ?? "md"])}
        >
          {icon}
        </span>
      )}
    </button>
  );
}
