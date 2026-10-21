import { useTranslation } from "@smog/i18n/react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";
import { useReturnFocus } from "../lib/return-focus";
import { Button } from "./button";
import { overlayClasses } from "./dialog";

export interface AlertDialogProps {
  /** Content between the description and the actions (e.g. a confirmation field). */
  body?: ReactNode;
  /** Cancel label (`kit.cancel` by default). */
  cancelLabel?: string;
  /** The trigger element (optional when controlled with `open`). */
  children?: ReactNode;
  className?: string;
  /** Disables confirm (until the body's field is filled in). */
  confirmDisabled?: boolean;
  /** Confirm label (`kit.confirm` by default). */
  confirmLabel?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  /** Shows a spinner on confirm while an async action runs. */
  loading?: boolean;
  onConfirm: () => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: ReactNode;
  /** `danger` for destructive, irreversible actions. */
  tone?: "default" | "danger";
}

/** A confirmation that interrupts: title, description, cancel and confirm. */
export function AlertDialog({
  body,
  cancelLabel,
  children,
  className,
  confirmDisabled = false,
  confirmLabel,
  defaultOpen,
  description,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  title,
  tone = "default",
}: AlertDialogProps): ReactNode {
  const { t } = useTranslation();
  const container = usePortalContainer();
  const focus = useReturnFocus({});
  return (
    <AlertDialogPrimitive.Root
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      open={open}
    >
      {children ? (
        <AlertDialogPrimitive.Trigger asChild>
          {children}
        </AlertDialogPrimitive.Trigger>
      ) : null}
      <AlertDialogPrimitive.Portal container={container}>
        <AlertDialogPrimitive.Overlay
          className={overlayClasses}
          data-slot="alert-dialog-overlay"
        />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex w-11/12 max-w-reading -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-4xl bg-popover p-6 text-popover-foreground shadow-2 outline-none ring-1 ring-foreground/10",
            "data-closed:animate-pop-out data-open:animate-pop-in motion-reduce:animate-none",
            className
          )}
          data-slot="alert-dialog-content"
          {...(description ? {} : { "aria-describedby": undefined })}
          {...focus}
        >
          <div className="flex flex-col gap-1">
            <AlertDialogPrimitive.Title
              className="font-semibold text-title-2"
              data-slot="alert-dialog-title"
            >
              {title}
            </AlertDialogPrimitive.Title>
            {description ? (
              <AlertDialogPrimitive.Description
                className="text-body text-muted-foreground"
                data-slot="alert-dialog-description"
              >
                {description}
              </AlertDialogPrimitive.Description>
            ) : null}
          </div>
          {body ? <div className="flex flex-col gap-4">{body}</div> : null}
          <div
            className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            data-slot="alert-dialog-footer"
          >
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">
                {cancelLabel ?? t("kit.cancel")}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                disabled={confirmDisabled}
                loading={loading}
                onClick={onConfirm}
                variant={tone === "danger" ? "danger" : "primary"}
              >
                {confirmLabel ?? t("kit.confirm")}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
