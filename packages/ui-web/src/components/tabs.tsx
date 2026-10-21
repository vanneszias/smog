import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { disabled, focusRing, transition } from "../lib/variants";

/** Tabs switch between views of the same thing (Radix Tabs). */
export function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>): ReactNode {
  return (
    <TabsPrimitive.Root
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className
      )}
      data-orientation={orientation}
      data-slot="tabs"
      orientation={orientation}
      {...props}
    />
  );
}

export interface TabsListProps
  extends ComponentProps<typeof TabsPrimitive.List> {
  /** `line` (the default): an underline under the active tab. `pill`: the registry's muted track with a raised active tab. */
  variant?: "line" | "pill";
}

export function TabsList({
  className,
  variant = "line",
  ...props
}: TabsListProps): ReactNode {
  return (
    <TabsPrimitive.List
      className={cn(
        "group/tabs-list flex gap-1 overflow-x-auto text-muted-foreground group-data-vertical/tabs:flex-col",
        variant === "line"
          ? "border-border-subtle border-b group-data-vertical/tabs:border-r group-data-vertical/tabs:border-b-0"
          : "w-fit rounded-4xl bg-muted p-[3px] group-data-vertical/tabs:rounded-2xl",
        className
      )}
      data-slot="tabs-list"
      data-variant={variant}
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
        "relative inline-flex min-h-touch shrink-0 items-center justify-center gap-2 whitespace-nowrap border-transparent px-4 font-medium text-body-sm text-foreground-muted [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "hover:text-foreground data-active:text-foreground",
        // line: the underline sits on the list border.
        "group-data-vertical/tabs:group-data-[variant=line]/tabs-list:-mr-px group-data-vertical/tabs:group-data-[variant=line]/tabs-list:mb-0 group-data-vertical/tabs:group-data-[variant=line]/tabs-list:border-r-2 group-data-vertical/tabs:group-data-[variant=line]/tabs-list:border-b-0 group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:data-active:border-primary",
        // pill: a raised active tab.
        "group-data-[variant=pill]/tabs-list:rounded-4xl group-data-[variant=pill]/tabs-list:border group-data-[variant=pill]/tabs-list:data-active:bg-background dark:group-data-[variant=pill]/tabs-list:data-active:border-input dark:group-data-[variant=pill]/tabs-list:data-active:bg-input/30",
        focusRing,
        transition,
        disabled,
        className
      )}
      data-slot="tabs-trigger"
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
      className={cn("flex-1 rounded-md", focusRing, className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}
