import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {
    /* noop */
  },
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((nextMessage: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setMessage(nextMessage);
    timeoutRef.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport message={message} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ message }: { message: string | null }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: message ? 180 : 140,
        toValue: message ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: message ? 180 : 140,
        toValue: message ? 0 : -8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [message, opacity, translateY]);

  if (!message) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[
        styles.toast,
        SHADOWS.large,
        {
          backgroundColor: theme.text,
          opacity,
          top: insets.top + SPACING.sm,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={[styles.toastText, { color: theme.background }]}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: "center",
    borderRadius: BORDER_RADIUS.round,
    left: SPACING.lg,
    maxWidth: 420,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    position: "absolute",
    right: SPACING.lg,
    zIndex: 1000,
  },
  toastText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    textAlign: "center",
  },
});
