import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import type React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
    <View style={styles.wrapper}>
      {/* "Filters:" label */}
      <Text style={[styles.label, { color: theme.textLight }]}>Filters</Text>

      {/* Scrollable chip row */}
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {selectedCategories.map((category) => (
          <TouchableOpacity
            activeOpacity={0.75}
            key={category}
            onPress={() => onRemoveCategory(category)}
            style={[
              styles.chip,
              {
                backgroundColor: theme.secondary,
                borderColor: `${theme.secondary}99`,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: theme.text }]}>
              {category}
            </Text>
            <Ionicons
              color={theme.text}
              name="close"
              size={13}
              style={styles.closeIcon}
            />
          </TouchableOpacity>
        ))}

        {/* Clear all — only shown when 2+ categories selected */}
        {selectedCategories.length > 1 && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onClearCategories}
            style={[styles.clearButton, { borderColor: theme.border }]}
          >
            <Text style={[styles.clearText, { color: theme.textLight }]}>
              Wis alles
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: "Onest-Medium",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  content: {
    gap: SPACING.xs,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs - 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
  },
  chipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: "Onest-Medium",
  },
  closeIcon: {
    opacity: 0.7,
    marginTop: 0.5,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    marginLeft: SPACING.xs,
  },
  clearText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.regular,
    fontFamily: "Onest-Regular",
  },
});

export default CategoryFilters;
