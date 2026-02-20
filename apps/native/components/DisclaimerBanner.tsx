import { Ionicons } from "@expo/vector-icons";
import {
  ANIMATION_DURATION,
  BORDER_RADIUS,
  colors,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";

const COURSE_URL = "https://smog.vlaanderen/volg-een-cursus";

interface DisclaimerBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  visible,
  onDismiss,
}) => {
  const { theme } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(16)).current;
  // Track whether the banner has ever been shown so we don't render DOM nodes
  // until needed, while still allowing the exit animation to play.
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setHasBeenVisible(true);
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION.normal,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 180,
        }),
      ]).start();
    } else if (hasBeenVisible) {
      // Play exit animation then unmount
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION.fast,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 16,
          duration: ANIMATION_DURATION.fast,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsMounted(false);
      });
    }
  }, [visible, hasBeenVisible, fadeAnim, translateYAnim]);

  if (!isMounted) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: translateYAnim }],
        },
      ]}
    >
      <View
        style={[
          styles.banner,
          {
            backgroundColor: theme.card,
            borderColor: `${colors.warning}40`,
          },
          SHADOWS.small,
        ]}
      >
        {/* Amber accent bar on left */}
        <View style={styles.accentBar} />

        {/* Icon */}
        <View style={styles.iconWrapper}>
          <Ionicons
            color={colors.warning}
            name="information-circle"
            size={22}
          />
        </View>

        {/* Text content */}
        <View style={styles.textWrapper}>
          <Text style={[styles.titleNl, { color: theme.text }]}>
            Belangrijke mededeling
          </Text>
          <Text style={[styles.messageNl, { color: theme.text }]}>
            Deze video's zijn een richtlijn en{" "}
            <Text style={styles.emphasis}>geen vervanging</Text> voor de
            officiële SMOG-cursussen.{" "}
            <Text
              onPress={() => Linking.openURL(COURSE_URL)}
              style={[styles.link, { color: theme.primary }]}
            >
              Volg een cursus op smog.vlaanderen
            </Text>
            .
          </Text>
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          activeOpacity={0.6}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          onPress={onDismiss}
          style={styles.dismissButton}
        >
          <Ionicons color={theme.textLight} name="close" size={18} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: SPACING.sm + 2,
    paddingRight: SPACING.sm,
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: colors.warning,
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderBottomLeftRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
  },
  iconWrapper: {
    marginTop: 1,
    marginRight: SPACING.xs + 2,
  },
  textWrapper: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  titleNl: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    fontFamily: "Onest-SemiBold",
    marginBottom: SPACING.xs,
    letterSpacing: 0.1,
  },
  messageNl: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    fontFamily: "Onest-Regular",
    lineHeight: 19,
  },
  emphasis: {
    fontWeight: FONT_WEIGHT.semibold,
    fontFamily: "Onest-SemiBold",
    color: colors.text,
  },
  link: {
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: "Onest-Medium",
    textDecorationLine: "underline",
  },
  dismissButton: {
    padding: SPACING.xs,
    marginTop: -2,
    opacity: 0.7,
  },
});

export default DisclaimerBanner;
