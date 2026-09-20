import {
  Content as TabsPrimitiveContent,
  List as TabsPrimitiveList,
  Root as TabsPrimitiveRoot,
  Trigger as TabsPrimitiveTrigger,
} from "@radix-ui/react-tabs";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Unlike Radix's dialog and menu roots, `Tabs.Root` is a `forwardRef` over a
 * `<div>` — verified in `@radix-ui/react-tabs`'s own declarations — so this
 * one does have a ref to pass on.
 */
export type TabsProps = ComponentPropsWithoutRef<typeof TabsPrimitiveRoot>;

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitiveRoot
      className={cn("flex flex-col gap-4", className)}
      ref={ref}
      {...props}
    />
  )
);

Tabs.displayName = "Tabs";

/**
 * A segmented control rather than an underlined strip: the selected tab is
 * marked by a raised surface, so nothing here has to decide whether a rule
 * under the tabs is a functional boundary or decoration.
 */
export const tabsListVariants = cva(
  "inline-flex w-fit items-center gap-1 rounded-md bg-surface p-1"
);

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitiveList>;

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitiveList
      className={cn(tabsListVariants(), className)}
      ref={ref}
      {...props}
    />
  )
);

TabsList.displayName = "TabsList";

export const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 font-medium text-foreground-muted text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-raised data-[state=active]:text-foreground data-[state=active]:shadow-sm"
);

export type TabsTriggerProps = ComponentPropsWithoutRef<
  typeof TabsPrimitiveTrigger
>;

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitiveTrigger
      className={cn(tabsTriggerVariants(), className)}
      ref={ref}
      {...props}
    />
  )
);

TabsTrigger.displayName = "TabsTrigger";

export type TabsContentProps = ComponentPropsWithoutRef<
  typeof TabsPrimitiveContent
>;

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitiveContent
      className={cn(
        "pt-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);

TabsContent.displayName = "TabsContent";
