import { useTranslation } from "@smog/i18n/react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";
import { IconButton } from "./icon-button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** The dimmed backdrop shared by Dialog, AlertDialog and Sheet. */
export const overlayClasses =
  "fixed inset-0 z-50 bg-foreground/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in motion-reduce:animate-none dark:bg-background/80";

export interface DialogContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  description?: ReactNode;
  /** Hide the corner close button (the footer then needs a way out). */
  hideClose?: boolean;
  /** The dialog's accessible name, shown as its heading. */
  title: ReactNode;
}

/** A centred modal: title, optional description, content and a close button. */
export function DialogContent({
  children,
  className,
  description,
  hideClose = false,
  title,
  ...props
}: DialogContentProps): ReactNode {
  const { t } = useTranslation();
  const container = usePortalContainer();
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-5/6 w-11/12 max-w-reading -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-6 text-foreground shadow-2 outline-none",
          "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in motion-reduce:animate-none",
          className
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex flex-col gap-1 pr-10">
          <DialogPrimitive.Title className="font-semibold text-title-2">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-body text-foreground-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close asChild>
            <IconButton
              className="absolute top-3 right-3"
              icon={<X />}
              label={t("a11y.close")}
            />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Actions at the bottom; stacked on mobile, right-aligned from `sm` up. */
export function DialogFooter({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}
