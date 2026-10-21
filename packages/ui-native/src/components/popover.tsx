import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { cn } from "../lib/cn";
import {
  createOverlay,
  type OverlayRootProps,
  withPress,
} from "../lib/overlay";
import { useShadow, useThemeVars } from "../lib/theme";
import { ToastViewport } from "./toast";

const overlay = createOverlay("Popover");

/** Where the trigger is on the screen, in window points. */
interface Anchor {
  /** Height. */
  h: number;
  /** Width. */
  w: number;
  x: number;
  y: number;
}

interface AnchorState {
  anchor: Anchor | null;
  ref: RefObject<View | null>;
  setAnchor: (anchor: Anchor) => void;
}

const AnchorContext = createContext<AnchorState | null>(null);

function useAnchor(): AnchorState {
  const state = useContext(AnchorContext);
  if (!state) {
    throw new Error("[uiNative] Popover parts must be inside <Popover>");
  }
  return state;
}

/** The popover's width in pt (`w-72`), and the gap kept to the screen edge. */
const WIDTH = 288;
const EDGE = 8;

/** Root: `open` / `defaultOpen` / `onOpenChange`. */
export function Popover({
  children,
  ...props
}: OverlayRootProps): ReactElement {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const value = useMemo(() => ({ anchor, ref, setAnchor }), [anchor]);
  return (
    <AnchorContext.Provider value={value}>
      <overlay.Root {...props}>{children}</overlay.Root>
    </AnchorContext.Provider>
  );
}

/**
 * Wraps one pressable child that opens the popover (web: `asChild`); the
 * popover opens next to it.
 */
export function PopoverTrigger({
  children,
}: {
  children: ReactElement;
}): ReactElement {
  const { open, show } = overlay.useOverlay();
  const { ref, setAnchor } = useAnchor();
  const measureThenShow = useCallback((): void => {
    const view = ref.current;
    if (!view) {
      show();
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      setAnchor({ h: height, w: width, x, y });
      show();
    });
  }, [ref, setAnchor, show]);
  return (
    <View className="self-start" collapsable={false} ref={ref}>
      {withPress(children, measureThenShow, { expanded: open })}
    </View>
  );
}

/** Wraps one pressable child that closes the popover. */
export const PopoverClose = overlay.Close;

export interface PopoverContentProps {
  /** The accessible name of the popover. */
  accessibilityLabel?: string;
  /** Which edge of the trigger the popover lines up with (default `center`). */
  align?: "center" | "end" | "start";
  children?: ReactNode;
  className?: string;
  /** Gap below the trigger in pt (default 4). */
  sideOffset?: number;
  testID?: string;
}

function leftFor(anchor: Anchor, align: "center" | "end" | "start"): number {
  const screen = Dimensions.get("window").width;
  let left = anchor.x;
  if (align === "center") {
    left = anchor.x + anchor.w / 2 - WIDTH / 2;
  } else if (align === "end") {
    left = anchor.x + anchor.w - WIDTH;
  }
  return Math.max(EDGE, Math.min(left, screen - WIDTH - EDGE));
}

/**
 * A floating panel under its trigger, in a native `Modal` (so the screen
 * reader stays inside and Android back closes it). Pressing outside closes
 * it. Place content inside; keep it short, a Sheet is for long content.
 */
export function PopoverContent({
  accessibilityLabel,
  align = "center",
  children,
  className,
  sideOffset = 4,
  testID,
}: PopoverContentProps): ReactElement {
  const { close, open } = overlay.useOverlay();
  const { anchor } = useAnchor();
  const reducedMotion = useReducedMotion();
  const themeVars = useThemeVars();
  const shadow = useShadow("2");
  const position = anchor
    ? {
        left: leftFor(anchor, align),
        top: anchor.y + anchor.h + sideOffset,
      }
    : { left: EDGE, top: EDGE };
  return (
    <Modal
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={open}
    >
      <View
        accessibilityViewIsModal
        className="flex-1"
        style={themeVars}
        testID="overlay-theme-root"
      >
        <Pressable
          accessibilityElementsHidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          onPress={close}
        />
        <View
          accessibilityLabel={accessibilityLabel}
          className={cn(
            "absolute w-72 flex-col gap-2 rounded-lg border border-border bg-popover p-4",
            className
          )}
          style={[position, shadow]}
          testID={testID}
        >
          {children}
        </View>
        <ToastViewport />
      </View>
    </Modal>
  );
}
