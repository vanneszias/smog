import Ionicons from "@expo/vector-icons/Ionicons";
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
const NL_LINK_PHRASES = ["Klik hier", "klik hier", "klik dan hier"];
const LINK_PHRASES: Record<string, string[]> = {
  en: ["Click here", "click here"],
  fr: ["Cliquez ici", "cliquez ici"],
  nl: NL_LINK_PHRASES,
};

interface DisclaimerBannerProps {
  onDismiss: () => void;
  visible: boolean;
}

const openCourseUrl = (): Promise<unknown> => Linking.openURL(COURSE_URL);

const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  visible,
  onDismiss,
}) => {
  const { theme } = useTheme();
  const { language, t } = useTranslation();
  const linkPhrases = LINK_PHRASES[language] ?? NL_LINK_PHRASES;
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
      for (const phrase of linkPhrases) {
        const index = remainingText.indexOf(phrase);
        if (
          index !== -1 &&
          (earliestMatch === null || index < earliestMatch.index)
        ) {
          earliestMatch = { index, phrase };
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
            onPress={openCourseUrl}
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
          duration: ANIMATION_DURATION.normal,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          damping: 18,
          stiffness: 180,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (hasBeenVisible) {
      // Play exit animation then unmount
      Animated.parallel([
        Animated.timing(fadeAnim, {
          duration: ANIMATION_DURATION.fast,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          duration: ANIMATION_DURATION.fast,
          toValue: 16,
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
            {t("gesture.disclaimer.title")}
          </Text>
          <Text style={[styles.messageNl, { color: theme.text }]}>
            {renderMessageWithLinks(t(`gesture.videoComplete.${messageIndex}`))}
          </Text>
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          accessibilityLabel={t("gesture.disclaimer.dismiss")}
          accessibilityRole="button"
          activeOpacity={0.6}
          hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
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
  accentBar: {
    alignSelf: "stretch",
    backgroundColor: colors.warning,
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderTopLeftRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
    width: 4,
  },
  banner: {
    alignItems: "flex-start",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
    paddingRight: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
  },
  container: {
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  dismissButton: {
    marginTop: -2,
    opacity: 0.7,
    padding: SPACING.xs,
  },
  emphasis: {
    color: colors.text,
    fontFamily: "Onest-SemiBold",
    fontWeight: FONT_WEIGHT.semibold,
  },
  iconWrapper: {
    marginRight: SPACING.xs + 2,
    marginTop: 1,
  },
  link: {
    fontFamily: "Onest-Medium",
    fontWeight: FONT_WEIGHT.medium,
    textDecorationLine: "underline",
  },
  messageNl: {
    fontFamily: "Onest-Regular",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: 19,
  },
  textWrapper: {
    flex: 1,
    paddingRight: SPACING.xs,
  },
  titleNl: {
    fontFamily: "Onest-SemiBold",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.1,
    marginBottom: SPACING.xs,
  },
});

/** Memoised — `visible` and `onDismiss` are stable primitives/refs, so this
 *  prevents re-renders driven by unrelated parent state. */
export default DisclaimerBanner;
