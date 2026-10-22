import { tokens } from "@smog/styles/tokens";
import { cva, type VariantProps } from "class-variance-authority";
import { DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuGroup = DropdownMenu.Group;

/** A dropdown of actions (Radix DropdownMenu; an action sheet on native). */
export function MenuContent({
  className,
  sideOffset = tokens.spacing["1"],
  align = "end",
  ...props
}: ComponentProps<typeof DropdownMenu.Content>): ReactNode {
  const container = usePortalContainer();
  return (
    <DropdownMenu.Portal container={container}>
      <DropdownMenu.Content
        align={align}
        className={cn(
          "z-50 max-w-reading overflow-hidden rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-2 ring-1 ring-foreground/10",
          "data-closed:animate-fade-out data-open:animate-fade-in motion-reduce:animate-none",
          className
        )}
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

const menuItemVariants = cva(
  "relative flex min-h-touch cursor-default select-none items-center gap-3 rounded-xl px-3 text-body outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        danger:
          "text-danger-strong data-highlighted:bg-danger-subtle data-highlighted:text-danger-strong",
        default: "text-foreground",
      },
    },
  }
);

export interface MenuItemProps
  extends ComponentProps<typeof DropdownMenu.Item>,
    VariantProps<typeof menuItemVariants> {
  /** A leading decorative icon. */
  icon?: ReactNode;
}

export function MenuItem({
  children,
  className,
  icon,
  variant,
  ...props
}: MenuItemProps): ReactNode {
  return (
    <DropdownMenu.Item
      className={cn(menuItemVariants({ variant }), className)}
      data-slot="dropdown-menu-item"
      data-variant={variant ?? "default"}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex *:size-5">
          {icon}
        </span>
      ) : null}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Label>): ReactNode {
  return (
    <DropdownMenu.Label
      className={cn(
        "px-3 py-2 font-medium text-caption text-muted-foreground",
        className
      )}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Separator>): ReactNode {
  return (
    <DropdownMenu.Separator
      className={cn("-mx-1.5 my-1 h-px bg-border-subtle", className)}
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}
