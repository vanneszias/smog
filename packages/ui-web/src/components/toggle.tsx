import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, hitArea, transition } from "../lib/variants";

/**
 * The registry toggle with the kit's sizes (44 px at `md`, 48 at `lg`; `sm`
 * is 32 with a 44 px hit area) and focus ring. `aria-pressed` / `data-state`
 * come from Radix.
 */
export const toggleVariants = cva(
  [
    "group/toggle relative inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-4xl font-medium hover:bg-muted hover:text-foreground aria-pressed:bg-muted data-[state=on]:bg-muted [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    focusRing,
    transition,
    disabled,
  ],
  {
    defaultVariants: { size: "md", variant: "default" },
    variants: {
      size: {
        lg: "min-h-12 min-w-12 px-5 text-body",
        md: "min-h-touch min-w-touch px-4 text-body",
        sm: cn("min-h-8 min-w-8 px-3 text-body-sm", hitArea),
      },
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent hover:bg-muted",
      },
    },
  }
);

function Toggle({
  className,
  variant = "default",
  size = "md",
  ...props
}: ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      className={cn(toggleVariants({ className, size, variant }))}
      data-slot="toggle"
      {...props}
    />
  );
}

export { Toggle };
