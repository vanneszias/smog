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
          "z-50 max-w-reading overflow-hidden rounded-md border border-border bg-surface-raised p-1 text-foreground shadow-2",
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in motion-reduce:animate-none",
          className
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

const menuItemVariants = cva(
  "relative flex min-h-touch cursor-default select-none items-center gap-3 rounded-sm px-3 text-body outline-none data-disabled:pointer-events-none data-highlighted:bg-surface-sunken data-disabled:opacity-50",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        danger: "text-danger-strong data-highlighted:bg-danger-subtle",
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
        "px-3 py-2 font-medium text-caption text-foreground-muted",
        className
      )}
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
      className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
      {...props}
    />
  );
}
