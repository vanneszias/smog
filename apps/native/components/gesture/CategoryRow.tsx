import {
  BORDER_RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  SPACING,
} from "@smog/styles";
import type React from "react";
import { useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface CategoryRowProps {
  categories: string[];
  onCategoryPress: (category: string) => void;
}

interface CategoryChipProps {
  category: string;
  onPress: (category: string) => void;
}

const CategoryChip = ({ category, onPress }: CategoryChipProps) => {
  const { theme } = useTheme();

  const handlePress = useCallback(() => {
    onPress(category);
  }, [onPress, category]);

  return (
    <View style={styles.categoryContainer}>
      <TouchableOpacity
        onPress={handlePress}
        style={[styles.category, { backgroundColor: theme.primary }]}
      >
        <Text style={[styles.categoryText, { color: theme.background }]}>
          {category}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const CategoryRow: React.FC<CategoryRowProps> = ({
  categories,
  onCategoryPress,
}) => (
  <View style={styles.container}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <CategoryChip
            category={category}
            key={category}
            onPress={onCategoryPress}
          />
        ))}
      </View>
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  category: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: BORDER_RADIUS.round,
    flexDirection: "row",
    marginBottom: 0,
    marginRight: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...SHADOWS.small,
  },
  categoryContainer: {
    flexDirection: "row",
  },
  categoryRow: {
    alignItems: "center",
    flexDirection: "row",
  },
  categoryText: {
    fontFamily: "Onest-Medium",
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  container: {
    marginBottom: SPACING.lg,
  },
});

export default CategoryRow;
