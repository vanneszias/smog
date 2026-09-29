import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, transition } from "../lib/variants";

/** Tabs switch between views of the same thing (Radix Tabs). */
export function Tabs({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>): ReactNode {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>): ReactNode {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex gap-1 overflow-x-auto border-border-subtle border-b",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>): ReactNode {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex min-h-touch shrink-0 items-center justify-center gap-2 whitespace-nowrap border-transparent border-b-2 px-4 font-medium text-body-sm text-foreground-muted",
        "hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground",
        focusRing,
        transition,
        disabled,
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>): ReactNode {
  return (
    <TabsPrimitive.Content
      className={cn("rounded-md", focusRing, className)}
      {...props}
    />
  );
}
