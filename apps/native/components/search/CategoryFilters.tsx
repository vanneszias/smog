import { Ionicons } from "@expo/vector-icons";
import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface CategoryFiltersProps {
  selectedCategories: string[];
  onRemoveCategory: (category: string) => void;
  onClearCategories: () => void;
}

const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  selectedCategories,
  onRemoveCategory,
  onClearCategories,
}) => {
  const { theme } = useTheme();

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
        <TouchableOpacity
          activeOpacity={0.8}
          key={category}
          onPress={() => onRemoveCategory(category)}
          style={[
            styles.chip,
            { backgroundColor: theme.primary },
            SHADOWS.small,
          ]}
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
      ))}

      {selectedCategories.length > 1 && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onClearCategories}
          style={[styles.clearChip, { borderColor: theme.border }]}
        >
          <Ionicons color={theme.textLight} name="close" size={13} />
          <Text style={[styles.clearText, { color: theme.textLight }]}>
            Clear all
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: SPACING.xs,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    paddingHorizontal: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs - 2,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: "Onest-Medium",
  },
  closeIcon: {
    opacity: 0.85,
  },
  clearChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    gap: SPACING.xs - 2,
    marginLeft: SPACING.xs,
  },
  clearText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.regular,
    fontFamily: "Onest-Regular",
  },
});

export default CategoryFilters;
