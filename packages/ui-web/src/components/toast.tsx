import { useTranslation } from "@smog/i18n/react";
import { cva } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { cn } from "../lib/cn";
import { focusRing, transition } from "../lib/variants";
import { IconButton } from "./icon-button";

export type ToastVariant = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  /** One action (e.g. undo); the toast closes after it runs. */
  action?: { label: string; onClick: () => void };
  description?: ReactNode;
  /** Milliseconds before it closes (5000 by default). */
  duration?: number;
  title: ReactNode;
  variant?: ToastVariant;
}

interface ToastEntry extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastApi {
  dismiss: (id: number) => void;
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => number;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Queue toasts from anywhere under ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("[ui-web] useToast must be used inside <ToastProvider>");
  }
  return api;
}

const ICONS = {
  danger: CircleAlert,
  neutral: Info,
  success: CircleCheck,
  warning: TriangleAlert,
} as const;

const toastIconVariants = cva("mt-0.5 size-5 shrink-0", {
  variants: {
    variant: {
      danger: "text-danger-strong",
      neutral: "text-primary-strong",
      success: "text-success-strong",
      warning: "text-warning-strong",
    },
  },
});

/** How long a toast stays, in ms (the Radix default). */
const DEFAULT_DURATION = 5000;

let nextId = 0;

/** Holds the toast queue and renders the `aria-live` viewport (bottom right; bottom on mobile). */
export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((all) =>
      all.map((entry) => (entry.id === id ? { ...entry, open: false } : entry))
    );
  }, []);
  const toast = useCallback((options: ToastOptions) => {
    nextId += 1;
    const id = nextId;
    // Closed toasts have finished their exit animation by now.
    setToasts((all) => [
      ...all.filter((entry) => entry.open),
      { ...options, id, open: true },
    ]);
    return id;
  }, []);
  const api = useMemo(() => ({ dismiss, toast }), [dismiss, toast]);

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider label={t("a11y.notification")}>
        {children}
        {toasts.map((entry) => (
          <ToastItem entry={entry} key={entry.id} onDismiss={dismiss} />
        ))}
        <ToastPrimitive.Viewport
          className="fixed inset-x-0 bottom-0 z-50 m-0 flex list-none flex-col gap-2 p-4 outline-none sm:right-0 sm:left-auto sm:w-full sm:max-w-reading sm:p-6"
          label={t("a11y.notifications")}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}): ReactNode {
  const { t } = useTranslation();
  const variant = entry.variant ?? "neutral";
  const Icon = ICONS[variant];
  const handleOpenChange = useCallback(
    (open: boolean): void => {
      if (!open) {
        onDismiss(entry.id);
      }
    },
    [entry.id, onDismiss]
  );
  return (
    <ToastPrimitive.Root
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-foreground shadow-3",
        "data-[state=closed]:animate-fade-out data-[state=open]:animate-slide-up motion-reduce:animate-none sm:data-[state=open]:animate-slide-in-right",
        "data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-slide-out-right"
      )}
      data-variant={variant}
      duration={entry.duration ?? DEFAULT_DURATION}
      onOpenChange={handleOpenChange}
      open={entry.open}
      type={variant === "danger" ? "foreground" : "background"}
    >
      <Icon aria-hidden="true" className={toastIconVariants({ variant })} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastPrimitive.Title className="font-semibold text-body">
          {entry.title}
        </ToastPrimitive.Title>
        {entry.description ? (
          <ToastPrimitive.Description className="text-body-sm text-foreground-muted">
            {entry.description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      {entry.action ? (
        <ToastPrimitive.Action
          altText={entry.action.label}
          className={cn(
            "inline-flex min-h-touch shrink-0 items-center rounded-md px-3 font-medium text-body-sm text-primary-strong hover:bg-primary-subtle",
            focusRing,
            transition
          )}
          onClick={entry.action.onClick}
        >
          {entry.action.label}
        </ToastPrimitive.Action>
      ) : null}
      <ToastPrimitive.Close asChild>
        <IconButton
          className="-my-2 -mr-2"
          icon={<X />}
          label={t("a11y.dismiss")}
        />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
