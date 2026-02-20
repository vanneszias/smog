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

interface CategoryRowProps {
  categories: string[];
  onCategoryPress: (category: string) => void;
}

const CategoryRow: React.FC<CategoryRowProps> = ({
  categories,
  onCategoryPress,
}) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.categoryRow}>
          {categories.map((category) => (
            <View key={category} style={styles.categoryContainer}>
              <TouchableOpacity
                onPress={() => onCategoryPress(category)}
                style={[
                  styles.category,
                  {
                    backgroundColor: theme.secondary,
                    borderColor: `${theme.secondary}99`,
                  },
                ]}
              >
                <Text style={[styles.categoryText, { color: theme.text }]}>
                  {category}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryContainer: {
    flexDirection: "row",
  },
  category: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    marginRight: SPACING.xs,
    marginBottom: 0,
    alignSelf: "flex-start",
  },
  categoryText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: "Onest-Medium",
  },
});

export default CategoryRow;
