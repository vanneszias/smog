import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { typography } from "@/utils/typography";

interface CategoryFiltersProps {
  selectedCategories: string[];
  onRemoveCategory: (category: string) => void;
}

const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  selectedCategories,
  onRemoveCategory,
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
            styles.categoryChip,
            { backgroundColor: theme.primary },
            SHADOWS.small,
          ]}
        >
          <Text style={[typography.caption, { color: theme.background }]}>
            {category}
          </Text>
          <Ionicons
            color={theme.background}
            name="close-circle"
            size={ICON_SIZE.sm}
          />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
});

export default CategoryFilters;
