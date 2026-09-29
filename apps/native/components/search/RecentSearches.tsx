import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ICON_SIZE,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useRecentSearches } from "@/context/RecentSearchesContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface RecentSearchesProps {
  onSelect: (query: string) => void;
  searchTerm?: string;
  visible?: boolean;
}

interface RecentSearchItemProps {
  children: React.ReactNode;
  onSelect: (query: string) => void;
  query: string;
}

const RecentSearchItem = ({
  children,
  onSelect,
  query,
}: RecentSearchItemProps) => {
  const { theme } = useTheme();

  const handlePress = useCallback(() => {
    onSelect(query);
  }, [onSelect, query]);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={handlePress}
      style={styles.item}
    >
      <Ionicons color={theme.textLight} name="time" size={ICON_SIZE.sm} />
      {children}
    </TouchableOpacity>
  );
};

const RecentSearches: React.FC<RecentSearchesProps> = ({
  onSelect,
  searchTerm = "",
  visible = true,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { recentSearches, clearRecentSearches } = useRecentSearches();

  // Internal state to control rendering after closing animation
  const [shouldRender, setShouldRender] = useState(
    visible && recentSearches.length > 0
  );

  // Filter and sort recent searches by searchTerm
  const filtered = searchTerm
    ? recentSearches.filter((q) =>
        q.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : recentSearches;

  const shown = filtered.slice(0, 3);

  // Animation shared value for the container (fade)
  const fade = useSharedValue(visible && shown.length > 0 ? 1 : 0);

  // Animation shared values and animated styles for each item (up to 3)
  // Fade/height animation for items (optional: keep for subtle fade-in)
  const itemAnimatedStyles = [
    useAnimatedStyle(() => ({ opacity: fade.value }), [fade]),
    useAnimatedStyle(() => ({ opacity: fade.value }), [fade]),
    useAnimatedStyle(() => ({ opacity: fade.value }), [fade]),
  ];

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    if (visible && shown.length > 0) {
      setShouldRender(true);
      fade.value = withTiming(1, { duration: 200 });
    } else {
      fade.value = withTiming(0, { duration: 200 });
      // Hide after fade out
      hideTimeout = setTimeout(() => {
        setShouldRender(false);
      }, 200);
    }
    return () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [visible, shown.length, fade]);

  // Container animation: fade only
  const containerStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    shadowOpacity: interpolate(fade.value, [0, 1], [0, 0.12]),
  }));

  // Helper to highlight the searchTerm in the query
  const renderHighlightedQuery = (query: string) => {
    if (!searchTerm) {
      return <Text style={[styles.query, { color: theme.text }]}>{query}</Text>;
    }
    const lowerQuery = query.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const start = lowerQuery.indexOf(lowerSearch);
    if (start === -1) {
      return <Text style={[styles.query, { color: theme.text }]}>{query}</Text>;
    }
    const end = start + searchTerm.length;
    return (
      <Text style={[styles.query, { color: theme.text }]}>
        {query.slice(0, start)}
        <Text style={[styles.highlight, { color: theme.primary }]}>
          {query.slice(start, end)}
        </Text>
        {query.slice(end)}
      </Text>
    );
  };

  if (!shouldRender || shown.length === 0) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.container,
        { backgroundColor: theme.card, shadowColor: theme.primary },
        containerStyle,
        // Hide overflow so height animation clips content
        { overflow: "hidden" },
      ]}
    >
      <View>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t("search.recentSearches")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={clearRecentSearches}
          >
            <Text style={[styles.clearButton, { color: theme.primary }]}>
              {t("search.clear")}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.list}>
          {shown.map((query, i) => (
            <Animated.View key={query} style={itemAnimatedStyles[i]}>
              <RecentSearchItem onSelect={onSelect} query={query}>
                {renderHighlightedQuery(query)}
              </RecentSearchItem>
            </Animated.View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  clearButton: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  container: {
    borderRadius: BORDER_RADIUS.md,
    elevation: 4,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    shadowOffset: { height: 6, width: 0 },
    shadowRadius: 12,
    width: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  highlight: {
    fontWeight: FONT_WEIGHT.bold,
  },
  item: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.sm,
    flexDirection: "row",
    paddingVertical: SPACING.xs,
  },
  list: {
    gap: SPACING.xs,
  },
  query: {
    fontSize: FONT_SIZE.sm,
    marginLeft: SPACING.xs,
  },
  title: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
});

export default RecentSearches;
