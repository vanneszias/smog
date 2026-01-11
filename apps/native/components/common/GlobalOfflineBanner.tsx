import { Ionicons } from "@expo/vector-icons";
import { FONT_SIZE, FONT_WEIGHT, ICON_SIZE, SPACING } from "@smog/styles";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const GlobalOfflineBanner: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();

  const [bannerState, setBannerState] = useState<
    "hidden" | "offline" | "online"
  >("hidden");
  const [hasShownOfflineBanner, setHasShownOfflineBanner] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const onlineTimeoutRef = useRef<number | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);
  const previousOfflineState = useRef<boolean | null>(null);
  const appStartTime = useRef(Date.now());

  const showBanner = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const hideBanner = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setBannerState("hidden");
    });
  }, [slideAnim]);

  // Helper function to handle initial offline state
  const handleInitialState = useCallback(
    (offline: boolean) => {
      previousOfflineState.current = offline;

      // If app opens offline (and enough time has passed since app start), show offline banner
      if (offline && Date.now() - appStartTime.current > 1000) {
        setBannerState("offline");
        setHasShownOfflineBanner(true);
        showBanner();
      }
    },
    [showBanner]
  );

  // Helper function to handle state changes after initialization
  const handleStateChange = useCallback(
    (offline: boolean) => {
      // Check if state actually changed
      if (previousOfflineState.current === offline) {
        return; // No change, do nothing
      }

      // Ignore very quick transitions that happen within first 2 seconds of app start
      if (Date.now() - appStartTime.current < 2000) {
        previousOfflineState.current = offline;
        return;
      }

      // Clear any existing timeout
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
        onlineTimeoutRef.current = null;
      }

      if (offline) {
        // Went offline - show offline banner
        setBannerState("offline");
        setHasShownOfflineBanner(true);
        showBanner();
      } else if (hasShownOfflineBanner) {
        // Went online - only show if we've previously shown an offline banner
        setBannerState("online");
        showBanner();

        // Auto-dismiss after 3 seconds
        onlineTimeoutRef.current = setTimeout(() => {
          hideBanner();
        }, 3000);
      }

      // Update previous state
      previousOfflineState.current = offline;
    },
    [showBanner, hideBanner, hasShownOfflineBanner]
  );

  // Handle network state changes
  useEffect(() => {
    // Clear any existing debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce network changes to avoid initial app startup artifacts
    debounceTimeoutRef.current = setTimeout(() => {
      // First time - just record the initial state
      if (previousOfflineState.current === null) {
        handleInitialState(isOffline);
        return;
      }

      handleStateChange(isOffline);
    }, 500); // 500ms debounce to avoid rapid initial changes
  }, [isOffline, handleInitialState, handleStateChange]);

  // Cleanup timeouts on unmount
  useEffect(
    () => () => {
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    },
    []
  );

  const handleDismiss = useCallback(() => {
    // Clear timeout if user manually dismisses
    if (onlineTimeoutRef.current) {
      clearTimeout(onlineTimeoutRef.current);
      onlineTimeoutRef.current = null;
    }

    hideBanner();
  }, [hideBanner]);

  // Don't render if banner is hidden
  if (bannerState === "hidden") {
    return null;
  }

  const isOnlineMessage = bannerState === "online";
  const backgroundColor = isOnlineMessage ? theme.primary : theme.error;
  const iconName = isOnlineMessage ? "cloud-done" : "cloud-offline";
  const message = isOnlineMessage
    ? t("search.backOnline")
    : t("search.offlineMode");

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor },
        {
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-100, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          color={theme.background}
          name={iconName}
          size={ICON_SIZE.sm}
        />
        <Text style={[styles.text, { color: theme.background }]}>
          {message}
        </Text>
        <TouchableOpacity onPress={handleDismiss} style={styles.dismissButton}>
          <Ionicons color={theme.background} name="close" size={ICON_SIZE.sm} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    opacity: 0.9, // Slightly transparent for better visibility
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xxl, // Extra padding for status bar and visibility
  },
  text: {
    marginLeft: SPACING.sm,
    marginRight: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    flex: 1,
  },
  dismissButton: {
    padding: SPACING.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default GlobalOfflineBanner;
