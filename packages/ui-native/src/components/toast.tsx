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
  useRef,
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
import { useColor, useShadow, useThemeVars } from "../lib/theme";
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

/**
 * Where toasts are drawn. The provider's own viewport sits over the screen;
 * Dialog/AlertDialog (a native Modal) and Sheet/Select/Menu (the sheet host)
 * mount another one while open, and only the most recently mounted draws,
 * so a toast fired from an overlay shows above it, once.
 */
interface ToastHosts {
  dismiss: (id: number) => void;
  register: (host: number) => () => void;
  toasts: readonly ToastEntry[];
  top: number | undefined;
}

const ToastContext = createContext<ToastApi | null>(null);
const ToastHostContext = createContext<ToastHosts | null>(null);

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
let nextHost = 0;

/**
 * Holds the toast queue and draws it at the bottom of the topmost surface
 * (the screen, or an open overlay), in a region named `a11y.notifications`.
 * `danger` toasts are assertive alerts, the rest polite; iOS gets an
 * announcement (it has no live regions).
 */
export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [hosts, setHosts] = useState<number[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((entry) => entry.id !== id));
  }, []);
  const toast = useCallback(
    (options: ToastOptions) => {
      nextId += 1;
      const id = nextId;
      setToasts((all) => [...all, { ...options, id }]);
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, options.duration ?? DEFAULT_DURATION)
      );
      // Read once on iOS; Android uses the live region.
      AccessibilityInfo.announceForAccessibility(
        [textOf(options.title), textOf(options.description)]
          .filter(Boolean)
          .join(". ")
      );
      return id;
    },
    [dismiss]
  );
  const register = useCallback((host: number) => {
    setHosts((all) => [...all, host]);
    return () => {
      setHosts((all) => all.filter((other) => other !== host));
    };
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  const api = useMemo(() => ({ dismiss, toast }), [dismiss, toast]);
  const hostState = useMemo(
    () => ({ dismiss, register, toasts, top: hosts.at(-1) }),
    [dismiss, hosts, register, toasts]
  );
  return (
    <ToastContext.Provider value={api}>
      <ToastHostContext.Provider value={hostState}>
        {children}
        <ToastViewport root />
      </ToastHostContext.Provider>
    </ToastContext.Provider>
  );
}

/**
 * A place toasts can be drawn: the provider has one, and every open overlay
 * mounts one at its root. Renders nothing outside a ToastProvider.
 */
export function ToastViewport({
  root = false,
  testID,
}: {
  /** The provider's own viewport: the bottom of the stack, never registered. */
  root?: boolean;
  testID?: string;
}): ReactElement | null {
  const hosts = useContext(ToastHostContext);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const themeVars = useThemeVars();
  const [id] = useState(() => {
    nextHost += 1;
    return nextHost;
  });
  const register = hosts?.register;
  useEffect(() => (root ? undefined : register?.(id)), [id, register, root]);
  const drawing = root ? hosts?.top === undefined : hosts?.top === id;
  if (!(hosts && drawing) || hosts.toasts.length === 0) {
    return null;
  }
  return (
    <View
      accessibilityLabel={t("a11y.notifications")}
      className="absolute inset-x-0 bottom-0 flex-col gap-2 p-4"
      pointerEvents="box-none"
      style={[
        themeVars,
        { paddingBottom: insets.bottom + tokens.spacing["4"] },
      ]}
      testID={testID}
    >
      {hosts.toasts.map((entry) => (
        <ToastItem entry={entry} key={entry.id} onDismiss={hosts.dismiss} />
      ))}
    </View>
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
  const { id } = entry;
  const assertive = variant === "danger";

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
