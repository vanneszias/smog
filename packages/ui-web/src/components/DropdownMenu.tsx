import {
  Content as DropdownMenuPrimitiveContent,
  Group as DropdownMenuPrimitiveGroup,
  Item as DropdownMenuPrimitiveItem,
  Label as DropdownMenuPrimitiveLabel,
  Portal as DropdownMenuPrimitivePortal,
  Root as DropdownMenuPrimitiveRoot,
  Separator as DropdownMenuPrimitiveSeparator,
  Trigger as DropdownMenuPrimitiveTrigger,
} from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { cn } from "../lib/cn";

/**
 * Radix's menu root is `React.FC<DropdownMenuProps>` — no ref — and the
 * trigger and group need no styling of their own, so all three are
 * re-exported unwrapped rather than given a wrapper to keep in step.
 */
export const DropdownMenu = DropdownMenuPrimitiveRoot;
export const DropdownMenuTrigger = DropdownMenuPrimitiveTrigger;
export const DropdownMenuPortal = DropdownMenuPrimitivePortal;
export const DropdownMenuGroup = DropdownMenuPrimitiveGroup;

/**
 * Sized from Radix's own Popper variables rather than a guess: the available
 * height is whatever the viewport leaves, and the menu is at least as wide as
 * the control that opened it. Inventing `max-h-64` here would emit
 * `calc(var(--spacing) * 64)`, and `--spacing` is not a token this design
 * system declares.
 *
 * Border role: `border-subtle`. A popup's own edge is decoration.
 */
export const dropdownMenuContentVariants = cva(
  "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-1 text-foreground shadow-lg"
);

export type DropdownMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitiveContent
>;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitivePortal>
    <DropdownMenuPrimitiveContent
      className={cn(dropdownMenuContentVariants(), className)}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </DropdownMenuPrimitivePortal>
));

DropdownMenuContent.displayName = "DropdownMenuContent";

export const dropdownMenuItemVariants = cva(
  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-md outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-surface data-[highlighted]:text-foreground data-[disabled]:opacity-50"
);

export type DropdownMenuItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitiveItem
>;

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuItemProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitiveItem
    className={cn(dropdownMenuItemVariants(), className)}
    ref={ref}
    {...props}
  />
));

DropdownMenuItem.displayName = "DropdownMenuItem";

export type DropdownMenuLabelProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitiveLabel
>;

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  DropdownMenuLabelProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitiveLabel
    className={cn(
      "px-2 py-1 font-medium text-foreground-muted text-sm",
      className
    )}
    ref={ref}
    {...props}
  />
));

DropdownMenuLabel.displayName = "DropdownMenuLabel";

export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitiveSeparator
>;

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitiveSeparator
    className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
    ref={ref}
    {...props}
  />
));

DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
