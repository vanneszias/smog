import { useTranslation } from "@smog/i18n/react";
import type { ColorRole } from "@smog/styles/tokens";
import { tokens } from "@smog/styles/tokens";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Info from "lucide-react-native/icons/info";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import X from "lucide-react-native/icons/x";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ICON_SIZE, textOf } from "../lib/icon";
import { useColor, useShadow } from "../lib/theme";
import { IconButton } from "./icon-button";

export type ToastVariant = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  /** One action (e.g. undo); the toast closes after it runs. Web: `onClick`. */
  action?: { label: string; onPress: () => void };
  description?: ReactNode;
  /** Milliseconds before it closes (5000 by default). */
  duration?: number;
  title: ReactNode;
  variant?: ToastVariant;
}

interface ToastEntry extends ToastOptions {
  id: number;
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
    throw new Error("[uiNative] useToast must be used inside <ToastProvider>");
  }
  return api;
}

const ICONS = {
  danger: CircleAlert,
  neutral: Info,
  success: CircleCheck,
  warning: TriangleAlert,
} as const;

const ICON_ROLE: Record<ToastVariant, ColorRole> = {
  danger: "dangerStrong",
  neutral: "primaryStrong",
  success: "successStrong",
  warning: "warningStrong",
};

/** How long a toast stays, in ms (as web). */
const DEFAULT_DURATION = 5000;

let nextId = 0;

/**
 * Holds the toast queue and draws it above the content at the bottom, in a
 * region named `a11y.notifications`. `danger` toasts are assertive alerts,
 * the rest polite; iOS gets an announcement (it has no live regions).
 */
export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((entry) => entry.id !== id));
  }, []);
  const toast = useCallback((options: ToastOptions) => {
    nextId += 1;
    const id = nextId;
    setToasts((all) => [...all, { ...options, id }]);
    return id;
  }, []);
  const api = useMemo(() => ({ dismiss, toast }), [dismiss, toast]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 ? (
        <View
          accessibilityLabel={t("a11y.notifications")}
          className="absolute inset-x-0 bottom-0 flex-col gap-2 p-4"
          pointerEvents="box-none"
          style={{ paddingBottom: insets.bottom + tokens.spacing["4"] }}
        >
          {toasts.map((entry) => (
            <ToastItem entry={entry} key={entry.id} onDismiss={dismiss} />
          ))}
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const variant = entry.variant ?? "neutral";
  const Icon = ICONS[variant];
  const iconColor = useColor(ICON_ROLE[variant]);
  const shadow = useShadow("3");
  const { duration = DEFAULT_DURATION, id } = entry;
  const assertive = variant === "danger";

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [duration, id, onDismiss]);

  useEffect(() => {
    // The message is read once on iOS; Android uses the live region.
    const message = [textOf(entry.title), textOf(entry.description)]
      .filter(Boolean)
      .join(". ");
    AccessibilityInfo.announceForAccessibility(message);
  }, [entry.description, entry.title]);

  const dismiss = useCallback((): void => {
    onDismiss(id);
  }, [id, onDismiss]);
  const act = useCallback((): void => {
    entry.action?.onPress();
    onDismiss(id);
  }, [entry.action, id, onDismiss]);
  const motion = tokens.motion.duration;
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(motion.normal)}
      exiting={reducedMotion ? undefined : FadeOut.duration(motion.fast)}
    >
      <View
        accessibilityLiveRegion={assertive ? "assertive" : "polite"}
        accessibilityRole={assertive ? "alert" : undefined}
        className="w-full flex-row items-start gap-3 rounded-lg border border-border bg-surface-raised p-4"
        style={shadow}
        testID="toast"
      >
        <View
          accessibilityElementsHidden
          className="mt-0.5"
          importantForAccessibility="no-hide-descendants"
        >
          <Icon color={iconColor} size={ICON_SIZE.md} />
        </View>
        <View className="min-w-0 flex-1 flex-col gap-1">
          <Text className="font-semibold text-body text-foreground">
            {entry.title}
          </Text>
          {entry.description ? (
            <Text className="text-body-sm text-foreground-muted">
              {entry.description}
            </Text>
          ) : null}
        </View>
        {entry.action ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-touch shrink-0 items-center justify-center rounded-md px-3 active:bg-primary-subtle"
            onPress={act}
          >
            <Text className="font-medium text-body-sm text-primary-strong">
              {entry.action.label}
            </Text>
          </Pressable>
        ) : null}
        <IconButton
          className="-my-2 -mr-2"
          icon={<X />}
          label={t("a11y.dismiss")}
          onPress={dismiss}
        />
      </View>
    </Animated.View>
  );
}
