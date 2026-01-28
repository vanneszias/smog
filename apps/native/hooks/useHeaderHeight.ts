import { useCallback, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import { Platform, StatusBar, type View } from "react-native";
import {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import logger from "@/utils/logger";

interface UseHeaderHeightReturn {
  headerRef: React.RefObject<View | null>;
  headerHeight: number;
  onHeaderLayout: () => void;
  isHeaderMeasured: boolean;
  scrollY: number;
  isHeaderVisible: boolean;
  onScroll: (scrollY: number) => void;
  showHeader: () => void;
  hideHeader: () => void;
  animatedHeaderStyle: ViewStyle;
  animatedContentStyle: ViewStyle;
  translateY: SharedValue<number>;
  opacity: SharedValue<number>;
  scale: SharedValue<number>;
  paddingTop: SharedValue<number>;
}

interface UseHeaderHeightOptions {
  additionalTopPadding?: number;
  additionalBottomPadding?: number;
  includeStatusBar?: boolean;
  enableAutoHide?: boolean;
  hideThreshold?: number;
  showThreshold?: number;
}

/**
 * Custom hook for measuring header height including all paddings and margins
 * Useful for implementing scroll-based header hiding functionality
 */
export const useHeaderHeight = (
  options: UseHeaderHeightOptions = {}
): UseHeaderHeightReturn => {
  const {
    additionalTopPadding = 0,
    additionalBottomPadding = 0,
    includeStatusBar = false,
    enableAutoHide = true,
    hideThreshold = 50,
    showThreshold = 10,
  } = options;

  const headerRef = useRef<View>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isHeaderMeasured, setIsHeaderMeasured] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Animated values
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const paddingTop = useSharedValue(0);

  const onHeaderLayout = useCallback(() => {
    if (headerRef.current) {
      headerRef.current.measureInWindow((_x, _y, _width, height) => {
        // Calculate total header height including all paddings and margins
        let totalHeight =
          height + additionalTopPadding + additionalBottomPadding;

        // Add status bar height if needed (for Android)
        if (includeStatusBar && Platform.OS === "android") {
          totalHeight += StatusBar.currentHeight || 0;
        }

        setHeaderHeight(totalHeight);
        setIsHeaderMeasured(true);
        paddingTop.value = totalHeight;

        logger.log(
          `[useHeaderHeight] Measured header height: ${height}px, Total height: ${totalHeight}px`
        );
      });
    }
  }, [
    additionalTopPadding,
    additionalBottomPadding,
    includeStatusBar,
    paddingTop,
  ]);

  const animateHeaderHide = useCallback(
    (currentScrollY: number) => {
      setIsHeaderVisible(false);
      translateY.value = withTiming(-headerHeight, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.quad),
      });
      scale.value = withTiming(0.95, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      paddingTop.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
      logger.log(
        `[useHeaderHeight] Header hidden at scroll Y: ${currentScrollY}px`
      );
    },
    [headerHeight, translateY, opacity, scale, paddingTop]
  );

  const animateHeaderShow = useCallback(
    (currentScrollY: number) => {
      setIsHeaderVisible(true);
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      });
      opacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      scale.value = withSpring(1, {
        damping: 15,
        stiffness: 200,
        mass: 0.6,
      });
      paddingTop.value = withSpring(headerHeight, {
        damping: 20,
        stiffness: 300,
        mass: 0.8,
      });
      logger.log(
        `[useHeaderHeight] Header shown at scroll Y: ${currentScrollY}px`
      );
    },
    [headerHeight, translateY, opacity, scale, paddingTop]
  );

  const onScroll = useCallback(
    (currentScrollY: number) => {
      setScrollY(currentScrollY);

      if (!(enableAutoHide && isHeaderMeasured)) {
        return;
      }

      // Use a more stable approach: only track significant scroll direction changes
      const scrollDiff = currentScrollY - lastScrollY;
      const absScrollDiff = Math.abs(scrollDiff);

      // Ignore very small scroll movements to prevent jitter
      if (absScrollDiff < 5) {
        return;
      }

      // Hide header when scrolling down past threshold and we're past header height
      if (
        scrollDiff > hideThreshold &&
        currentScrollY > headerHeight * 1.5 &&
        isHeaderVisible
      ) {
        animateHeaderHide(currentScrollY);
      }

      // Show header when scrolling up past threshold or near top
      if (
        (scrollDiff < -showThreshold || currentScrollY < headerHeight) &&
        !isHeaderVisible
      ) {
        animateHeaderShow(currentScrollY);
      }

      setLastScrollY(currentScrollY);
    },
    [
      enableAutoHide,
      isHeaderMeasured,
      lastScrollY,
      hideThreshold,
      showThreshold,
      headerHeight,
      isHeaderVisible,
      animateHeaderHide,
      animateHeaderShow,
    ]
  );

  const showHeader = useCallback(() => {
    setIsHeaderVisible(true);
    translateY.value = withSpring(0, {
      damping: 20,
      stiffness: 300,
      mass: 0.8,
    });
    opacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 200,
      mass: 0.6,
    });
    paddingTop.value = withSpring(headerHeight, {
      damping: 20,
      stiffness: 300,
      mass: 0.8,
    });
  }, [translateY, opacity, scale, paddingTop, headerHeight]);

  const hideHeader = useCallback(() => {
    setIsHeaderVisible(false);
    translateY.value = withTiming(-headerHeight, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(0, {
      duration: 350,
      easing: Easing.out(Easing.quad),
    });
    scale.value = withTiming(0.95, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
    paddingTop.value = withTiming(0, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [translateY, opacity, scale, headerHeight, paddingTop]);

  // Animated style for the header
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
    shadowOpacity: opacity.value * 0.1,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowRadius: 8,
    elevation: opacity.value * 4,
  }));

  // Animated style for the content container
  const animatedContentStyle = useAnimatedStyle(() => ({
    paddingTop: paddingTop.value,
  }));

  return {
    headerRef,
    headerHeight,
    onHeaderLayout,
    isHeaderMeasured,
    scrollY,
    isHeaderVisible,
    onScroll,
    showHeader,
    hideHeader,
    animatedHeaderStyle,
    animatedContentStyle,
    translateY,
    opacity,
    scale,
    paddingTop,
  };
};
