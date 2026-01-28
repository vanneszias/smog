import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { BORDER_RADIUS, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { typography } from "@/utils/typography";

interface CategoryListBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategories: string[];
  onCategoryChange: (categories: string[]) => void;
}

/**
 * A specialized BottomSheet that renders a scrollable list of categories.
 * It uses BottomSheetFlatList as a direct child for proper gesture handling.
 */
const CategoryListBottomSheet: React.FC<CategoryListBottomSheetProps> = ({
  visible,
  onClose,
  categories,
  selectedCategories,
  onCategoryChange,
}) => {
  const { theme } = useTheme();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  // This effect synchronizes the `visible` prop with the bottom sheet's imperative API.
  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  // Toggle category selection and call onCategoryChange with new array
  const handleToggleCategory = useCallback(
    (category: string) => {
      let newSelected: string[];
      if (selectedCategories.includes(category)) {
        newSelected = selectedCategories.filter((c) => c !== category);
      } else {
        newSelected = [...selectedCategories, category];
      }
      onCategoryChange(newSelected);
    },
    [selectedCategories, onCategoryChange]
  );

  // Define the render function for each category item in the list
  const renderItem = useCallback(
    ({ item: category }: { item: string }) => {
      const isSelected = selectedCategories.includes(category);
      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleToggleCategory(category)}
          style={[
            styles.categoryItem,
            {
              backgroundColor: isSelected ? theme.primary : theme.card,
              borderColor: theme.border,
            },
            SHADOWS.small,
          ]}
        >
          <Text
            style={[
              typography.body,
              { color: isSelected ? theme.background : theme.text },
            ]}
          >
            {category}
          </Text>
        </TouchableOpacity>
      );
    },
    [selectedCategories, theme, handleToggleCategory]
  );

  // Define the backdrop component for tap-to-dismiss functionality
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.background }}
      index={0} // Provide multiple snap points for more flexibility
      onDismiss={onClose}
      ref={bottomSheetModalRef}
      snapPoints={["50%", "85%"]}
    >
      {/*
        The scrollable component MUST be the direct child of the modal
        for gestures to work correctly.
      */}
      <BottomSheetFlatList
        contentContainerStyle={styles.listContentContainer}
        data={categories}
        keyExtractor={(item: string) => item}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  listContentContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg, // Extra padding at the bottom for safe area
  },
  categoryItem: {
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
    borderWidth: 1,
  },
});

export default CategoryListBottomSheet;
