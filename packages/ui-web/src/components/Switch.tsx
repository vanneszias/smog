import {
  Root as SwitchRoot,
  Thumb as SwitchThumb,
} from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Border role: the track's edge is what makes an "off" switch visible against
 * the surface behind it, so it is the functional `border` (3:1), never the
 * decorative `border-subtle`.
 */
export const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface",
  {
    variants: {
      size: {
        sm: "h-5 w-10",
        md: "h-6 w-12",
        lg: "h-8 w-16",
      },
    },
    defaultVariants: { size: "md" },
  }
);

/*
 * The thumb's travel is the track's inner width minus the thumb's own width,
 * so the two scales are one decision, not two: sm 32 − 12 = 20, md 40 − 16 =
 * 24, lg 56 − 24 = 32. Sizing them apart is how a switch ends up with its
 * thumb stopping short of the end in exactly one size.
 */
export const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background shadow-sm transition-transform data-[state=unchecked]:translate-x-0",
  {
    variants: {
      size: {
        sm: "size-3 data-[state=checked]:translate-x-5",
        md: "size-4 data-[state=checked]:translate-x-6",
        lg: "size-6 data-[state=checked]:translate-x-8",
      },
    },
    defaultVariants: { size: "md" },
  }
);

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchRoot> &
  VariantProps<typeof switchVariants>;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, size, ...props }, ref) => (
    <SwitchRoot
      className={cn(switchVariants({ size }), className)}
      ref={ref}
      {...props}
    >
      <SwitchThumb className={switchThumbVariants({ size })} />
    </SwitchRoot>
  )
);

Switch.displayName = "Switch";
