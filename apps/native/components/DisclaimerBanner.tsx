import { Ionicons } from "@expo/vector-icons";
import { COURSE_URL, VIDEO_COMPLETE_COUNT } from "@smog/config";
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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

// Link phrases that should be clickable in the video complete messages
const LINK_PHRASES = ["Klik hier", "klik dan hier"];

interface DisclaimerBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  visible,
  onDismiss,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(16)).current;
  // Track whether the banner has ever been shown so we don't render DOM nodes
  // until needed, while still allowing the exit animation to play.
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Randomly select a message index (1-7) when component mounts
  const messageIndex = useMemo(
    () => Math.floor(Math.random() * VIDEO_COMPLETE_COUNT) + 1,
    []
  );

  // Render message with clickable links
  const renderMessageWithLinks = (message: string) => {
    const parts: React.ReactNode[] = [];
    let remainingText = message;
    let keyIndex = 0;

    while (remainingText.length > 0) {
      let earliestMatch: { phrase: string; index: number } | null = null;

      // Find the earliest occurrence of any link phrase
      for (const phrase of LINK_PHRASES) {
        const index = remainingText.indexOf(phrase);
        if (
          index !== -1 &&
          (earliestMatch === null || index < earliestMatch.index)
        ) {
          earliestMatch = { phrase, index };
        }
      }

      if (earliestMatch) {
        // Add text before the link
        if (earliestMatch.index > 0) {
          parts.push(
            <Text
              key={keyIndex++}
              style={[styles.messageNl, { color: theme.text }]}
            >
              {remainingText.slice(0, earliestMatch.index)}
            </Text>
          );
        }

        // Add the clickable link
        parts.push(
          <Text
            key={keyIndex++}
            onPress={() => Linking.openURL(COURSE_URL)}
            style={[styles.link, { color: theme.primary }]}
          >
            {earliestMatch.phrase}
          </Text>
        );

        // Continue with remaining text
        remainingText = remainingText.slice(
          earliestMatch.index + earliestMatch.phrase.length
        );
      } else {
        // No more links, add remaining text
        parts.push(
          <Text
            key={keyIndex++}
            style={[styles.messageNl, { color: theme.text }]}
          >
            {remainingText}
          </Text>
        );
        break;
      }
    }

    return parts;
  };

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
            {t("gesture.disclaimer.titleNl")}
          </Text>
          <Text style={[styles.messageNl, { color: theme.text }]}>
            {renderMessageWithLinks(t(`gesture.videoComplete.${messageIndex}`))}
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

/** Memoised — `visible` and `onDismiss` are stable primitives/refs, so this
 *  prevents re-renders driven by unrelated parent state. */
export default DisclaimerBanner;
