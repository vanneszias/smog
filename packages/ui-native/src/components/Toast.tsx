import { cva, type VariantProps } from "class-variance-authority";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

const DISMISS_AFTER_MS = 4000;

/**
 * The native twin of `packages/ui-web/src/components/Toast.tsx`, collapsed
 * into a single active message rather than `sonner`'s stacked queue: nothing
 * in this app shows two confirmations at once, so a second `show()` replaces
 * the first instead of queuing behind it.
 *
 * Two variants, not web's four — `info`/`success`/`warning` all read as "this
 * went fine" on a phone-sized screen, so they collapse into one `neutral`,
 * leaving the one distinction a user actually acts on differently: whether
 * something went wrong.
 */
export const toastVariants = cva(
  "absolute inset-x-md bottom-md flex-row items-center gap-sm rounded-md border border-border-subtle p-md shadow-lg",
  {
    variants: {
      variant: {
        neutral: "bg-surface-raised",
        danger: "bg-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

const labelVariants = cva("font-medium", {
  variants: {
    variant: {
      neutral: "text-foreground",
      danger: "text-danger-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export type ToastVariant = NonNullable<
  VariantProps<typeof toastVariants>["variant"]
>;

export interface ToastOptions {
  variant?: ToastVariant;
}

interface ActiveToast {
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

/**
 * No default value here on purpose. A `useContext` that falls back to a
 * no-op `show` would let a `useToast()` called outside `ToastProvider`
 * compile and run — quietly doing nothing instead of failing where the
 * mistake was made. A save that stops confirming is a bug found by a user in
 * production; a thrown error is the same bug found by a developer in
 * development, which is the only place `useToast`'s check belongs.
 */
const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (timer.current != null) {
      clearTimeout(timer.current);
    }

    setToast({ message, variant: options?.variant ?? "neutral" });

    timer.current = setTimeout(() => {
      setToast(null);
      timer.current = null;
    }, DISMISS_AFTER_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast == null ? null : (
        <View
          className={cn(toastVariants({ variant: toast.variant }))}
          testID="root"
        >
          <Text
            accessibilityLiveRegion="polite"
            className={labelVariants({ variant: toast.variant })}
          >
            {toast.message}
          </Text>
        </View>
      )}
    </ToastContext.Provider>
  );
}

/**
 * Throws outside a `ToastProvider` rather than returning a default `show`
 * that would silently do nothing. See the comment on `ToastContext`.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context == null) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
