import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

interface CategoryFiltersProps {
  onClearCategories: () => void;
  onRemoveCategory: (category: string) => void;
  selectedCategories: string[];
}

interface CategoryFilterChipProps {
  category: string;
  onRemove: (category: string) => void;
}

const CategoryFilterChip = ({
  category,
  onRemove,
}: CategoryFilterChipProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    onRemove(category);
  }, [onRemove, category]);

  return (
    <TouchableOpacity
      accessibilityLabel={t("search.removeCategory", { category })}
      accessibilityRole="button"
      activeOpacity={0.8}
      onPress={handlePress}
      style={[styles.chip, { backgroundColor: theme.primary }, SHADOWS.small]}
    >
      <Text style={[styles.chipText, { color: theme.background }]}>
        {category}
      </Text>
      <Ionicons
        color={theme.background}
        name="close-circle"
        size={15}
        style={styles.closeIcon}
      />
    </TouchableOpacity>
  );
};

const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  selectedCategories,
  onRemoveCategory,
  onClearCategories,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (selectedCategories.length === 0) {
    return null;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {selectedCategories.map((category) => (
        <CategoryFilterChip
          category={category}
          key={category}
          onRemove={onRemoveCategory}
        />
      ))}

      {selectedCategories.length > 1 && (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          onPress={onClearCategories}
          style={[styles.clearChip, { borderColor: theme.border }]}
        >
          <Ionicons color={theme.textLight} name="close" size={13} />
          <Text style={[styles.clearText, { color: theme.textLight }]}>
            {t("search.clearAll")}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.round,
    flexDirection: "row",
    gap: SPACING.xs - 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: "Onest-Medium",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  clearChip: {
    alignItems: "center",
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: "row",
    gap: SPACING.xs - 2,
    marginLeft: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
  },
  clearText: {
    fontFamily: "Onest-Regular",
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.regular,
  },
  closeIcon: {
    opacity: 0.85,
  },
  content: {
    gap: SPACING.xs,
    paddingBottom: SPACING.xs,
    paddingHorizontal: 2,
  },
});

export default CategoryFilters;
