import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type { GestureResponderEvent } from "react-native";
import { useControllableState } from "./controllable";

export interface OverlayState {
  /** Stable. */
  close: () => void;
  open: boolean;
  /** Stable. */
  show: () => void;
}

export interface OverlayRootProps {
  children?: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

/** One context per overlay kind, so a Menu inside a Sheet finds its own root. */
export function createOverlay(name: string): {
  Root: (props: OverlayRootProps) => ReactElement;
  Trigger: (props: { children: ReactElement }) => ReactElement;
  Close: (props: { children: ReactElement }) => ReactElement;
  useOverlay: () => OverlayState;
} {
  const Context = createContext<OverlayState | null>(null);

  function useOverlay(): OverlayState {
    const state = useContext(Context);
    if (!state) {
      throw new Error(`[uiNative] ${name} parts must be inside <${name}>`);
    }
    return state;
  }

  function Root({
    children,
    defaultOpen = false,
    onOpenChange,
    open,
  }: OverlayRootProps): ReactElement {
    const [current, setOpen] = useControllableState(
      open,
      defaultOpen,
      onOpenChange
    );
    const show = useCallback((): void => {
      setOpen(true);
    }, [setOpen]);
    const close = useCallback((): void => {
      setOpen(false);
    }, [setOpen]);
    const value = useMemo(
      () => ({ close, open: current, show }),
      [close, current, show]
    );
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function Trigger({ children }: { children: ReactElement }): ReactElement {
    const { open, show } = useOverlay();
    return withPress(children, show, { expanded: open });
  }

  function Close({ children }: { children: ReactElement }): ReactElement {
    const { close } = useOverlay();
    return withPress(children, close);
  }

  return { Close, Root, Trigger, useOverlay };
}

interface PressableElementProps {
  accessibilityState?: Record<string, unknown>;
  onPress?: (event: GestureResponderEvent) => void;
}

/**
 * Web's `asChild` trigger: the single child (a Button, IconButton, ListItem)
 * keeps its own `onPress` and also runs `action`.
 */
export function withPress(
  children: ReactElement,
  action: () => void,
  state?: Record<string, unknown>
): ReactElement {
  const child = Children.only(children);
  if (!isValidElement<PressableElementProps>(child)) {
    return child;
  }
  return cloneElement(child, {
    accessibilityState: state
      ? { ...child.props.accessibilityState, ...state }
      : child.props.accessibilityState,
    onPress: (event: GestureResponderEvent) => {
      child.props.onPress?.(event);
      action();
    },
  });
}
