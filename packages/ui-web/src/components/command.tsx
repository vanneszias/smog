import { useTranslation } from "@smog/i18n/react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Dialog, DialogContent } from "./dialog";

/**
 * A command palette / search list (registry `command`, on cmdk). It is the
 * heaviest registry part the kit carries, so it has its own entry point
 * (`@smog/ui-web/command`): screens load it with `lazy(() => import(...))`
 * and it never joins the main bundle.
 */
export function Command({
  className,
  label,
  ...props
}: ComponentProps<typeof CommandPrimitive>): ReactNode {
  const { t } = useTranslation();
  return (
    <CommandPrimitive
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-4xl bg-popover p-1 text-popover-foreground",
        className
      )}
      data-slot="command"
      label={label ?? t("common.search")}
      {...props}
    />
  );
}

export interface CommandDialogProps extends ComponentProps<typeof Dialog> {
  className?: string;
  description?: ReactNode;
  /** The dialog's accessible name (`common.search` by default). */
  title?: ReactNode;
}

/** The palette in a modal; opens with `open` / `onOpenChange` (a shortcut, a button). */
export function CommandDialog({
  children,
  className,
  description,
  title,
  ...props
}: CommandDialogProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-1/3 translate-y-0 gap-0 overflow-hidden p-0 [&>div:first-child]:sr-only",
          className
        )}
        description={description}
        hideClose
        title={title ?? t("common.search")}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  placeholder,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="p-1 pb-0" data-slot="command-input-wrapper">
      <div className="flex min-h-touch items-center gap-2 rounded-4xl border border-input bg-card px-4 focus-within:ring-2 focus-within:ring-ring">
        <SearchIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        <CommandPrimitive.Input
          className={cn(
            "w-full bg-transparent text-body outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          data-slot="command-input"
          placeholder={placeholder ?? t("kit.commandPlaceholder")}
          {...props}
        />
      </div>
    </div>
  );
}

export function CommandList({
  className,
  label,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>): ReactNode {
  const { t } = useTranslation();
  return (
    <CommandPrimitive.List
      className={cn(
        "max-h-72 scroll-py-1 overflow-y-auto overflow-x-hidden outline-none",
        className
      )}
      data-slot="command-list"
      label={label ?? t("kit.commandSuggestions")}
      {...props}
    />
  );
}

export function CommandEmpty({
  children,
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>): ReactNode {
  const { t } = useTranslation();
  return (
    <CommandPrimitive.Empty
      className={cn(
        "py-6 text-center text-body-sm text-muted-foreground",
        className
      )}
      data-slot="command-empty"
      {...props}
    >
      {children ?? t("kit.noResults")}
    </CommandPrimitive.Empty>
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>): ReactNode {
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-caption **:[[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      data-slot="command-group"
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>): ReactNode {
  return (
    // A listbox may only own options and groups: the divider is for the eye.
    <CommandPrimitive.Separator
      aria-hidden="true"
      className={cn("my-1 h-px bg-border-subtle", className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>): ReactNode {
  return (
    <CommandPrimitive.Item
      className={cn(
        "group/command-item relative flex min-h-touch cursor-default select-none items-center gap-2 rounded-2xl px-3 py-2 text-body outline-hidden data-[disabled=true]:pointer-events-none data-selected:bg-accent data-selected:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="command-item"
      {...props}
    />
  );
}

export function CommandShortcut({
  className,
  ...props
}: ComponentProps<"span">): ReactNode {
  return (
    <span
      className={cn(
        "ml-auto text-caption text-muted-foreground tracking-widest",
        className
      )}
      data-slot="command-shortcut"
      {...props}
    />
  );
}
