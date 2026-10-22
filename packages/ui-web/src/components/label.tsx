import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/** A form label (Radix Label: a click on it focuses or toggles its control). */
export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactNode {
  return (
    <LabelPrimitive.Root
      className={cn(
        "flex select-none items-center gap-2 font-medium text-body-sm text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className
      )}
      data-slot="label"
      {...props}
    />
  );
}
