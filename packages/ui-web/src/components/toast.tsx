import { useTranslation } from "@smog/i18n/react";
import { cva } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { toast as sonner, Toaster } from "sonner";
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

interface ToastApi {
  dismiss: (id: number) => void;
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => number;
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

/** How long a toast stays, in ms. */
const DEFAULT_DURATION = 5000;

let nextId = 0;

/**
 * The queue is sonner's (registry `sonner`): one module-level store, so the
 * API object never changes and `useToast` is stable. A toast is rendered with
 * `toast.custom` so the kit owns its markup: the variant icon and tone, an
 * action, the dismiss button named from i18n, and `role="alert"` (assertive)
 * for `danger` inside sonner's polite live region.
 */
const api: ToastApi = {
  dismiss: (id) => {
    sonner.dismiss(id);
  },
  toast: (options) => {
    nextId += 1;
    const id = nextId;
    sonner.custom(() => <ToastCard id={id} options={options} />, {
      duration: options.duration ?? DEFAULT_DURATION,
      id,
    });
    return id;
  },
};

const ToastContext = createContext<ToastApi | null>(null);

/** Queue toasts from anywhere under ToastProvider. */
export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("[ui-web] useToast must be used inside <ToastProvider>");
  }
  return value;
}

/** Sonner takes its colours from these; they follow the page theme. */
const TOASTER_STYLE = {
  "--border-radius": "var(--radius-2xl)",
  "--normal-bg": "var(--color-popover)",
  "--normal-border": "var(--color-border)",
  "--normal-text": "var(--color-popover-foreground)",
} as CSSProperties;

/** Renders sonner's `aria-live` region (bottom right; full width on mobile). */
export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { t } = useTranslation();
  // Sonner's store is module-wide and replays every active toast to a Toaster
  // that mounts later. A provider that goes away takes its toasts with it, so
  // a remount (a test, a new root) does not show the last one's leftovers.
  useEffect(
    () => () => {
      sonner.dismiss();
    },
    []
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster
        customAriaLabel={t("a11y.notifications")}
        mobileOffset={16}
        offset={24}
        position="bottom-right"
        style={TOASTER_STYLE}
        theme="system"
        visibleToasts={3}
      />
    </ToastContext.Provider>
  );
}

function ToastCard({
  id,
  options,
}: {
  id: number;
  options: ToastOptions;
}): ReactNode {
  const { t } = useTranslation();
  const variant = options.variant ?? "neutral";
  const Icon = ICONS[variant];
  const { action } = options;
  const handleDismiss = useCallback(() => {
    sonner.dismiss(id);
  }, [id]);
  const handleAction = useCallback(() => {
    action?.onClick();
    sonner.dismiss(id);
  }, [action, id]);
  return (
    <div
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl bg-popover p-4 text-popover-foreground shadow-3 ring-1 ring-foreground/10"
      )}
      data-slot="toast"
      data-variant={variant}
      role={variant === "danger" ? "alert" : undefined}
    >
      <Icon aria-hidden="true" className={toastIconVariants({ variant })} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-body">{options.title}</p>
        {options.description ? (
          <p className="text-body-sm text-muted-foreground">
            {options.description}
          </p>
        ) : null}
      </div>
      {action ? (
        <button
          className={cn(
            "inline-flex min-h-touch shrink-0 items-center rounded-4xl px-3 font-medium text-body-sm text-primary-strong hover:bg-primary-subtle",
            focusRing,
            transition
          )}
          onClick={handleAction}
          type="button"
        >
          {action.label}
        </button>
      ) : null}
      <IconButton
        className="-my-2 -mr-2"
        icon={<X />}
        label={t("a11y.dismiss")}
        onClick={handleDismiss}
      />
    </div>
  );
}
