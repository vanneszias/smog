import { useTranslation } from "@smog/i18n/react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "../lib/portal";
import { overlayClasses } from "./dialog";
import { IconButton } from "./icon-button";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const bottom =
  "inset-x-0 bottom-0 max-h-5/6 rounded-t-xl border-t data-[state=closed]:animate-slide-down data-[state=open]:animate-slide-up";
const right =
  "inset-y-0 right-0 h-full w-11/12 max-w-reading border-l data-[state=closed]:animate-slide-out-right data-[state=open]:animate-slide-in-right";
const left =
  "inset-y-0 left-0 h-full w-11/12 max-w-reading border-r data-[state=closed]:animate-slide-out-left data-[state=open]:animate-slide-in-left";

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 overflow-y-auto border-border-subtle bg-surface-raised p-6 text-foreground shadow-2 outline-none motion-reduce:animate-none",
  {
    defaultVariants: { side: "auto" },
    variants: {
      side: {
        // Bottom sheet on mobile, side panel from md (spec §16).
        auto: cn(
          bottom,
          "md:inset-x-auto md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-11/12 md:max-w-reading md:rounded-none md:border-t-0 md:border-l md:data-[state=closed]:animate-slide-out-right md:data-[state=open]:animate-slide-in-right"
        ),
        bottom,
        left,
        right,
      },
    },
  }
);

export interface SheetContentProps
  extends Omit<ComponentProps<typeof DialogPrimitive.Content>, "title">,
    VariantProps<typeof sheetVariants> {
  description?: ReactNode;
  hideClose?: boolean;
  /** The sheet's accessible name, shown as its heading. */
  title: ReactNode;
}

/** A modal panel from an edge: `auto` (bottom on mobile, right on desktop), `bottom`, `right`, `left`. */
export function SheetContent({
  children,
  className,
  description,
  hideClose = false,
  side,
  title,
  ...props
}: SheetContentProps): ReactNode {
  const { t } = useTranslation();
  const container = usePortalContainer();
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(sheetVariants({ side }), className)}
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

export function SheetFooter({
  className,
  ...props
}: ComponentProps<"div">): ReactNode {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}
