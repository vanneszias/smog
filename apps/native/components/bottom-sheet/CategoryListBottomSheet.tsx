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
  categories: string[];
  onCategoryChange: (categories: string[]) => void;
  onClose: () => void;
  selectedCategories: string[];
  visible: boolean;
}

interface CategoryListItemProps {
  category: string;
  isSelected: boolean;
  onToggle: (category: string) => void;
}

const keyExtractor = (item: string): string => item;

const CategoryListItem = ({
  category,
  isSelected,
  onToggle,
}: CategoryListItemProps) => {
  const { theme } = useTheme();

  const handlePress = useCallback(() => {
    onToggle(category);
  }, [onToggle, category]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
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
};

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
    ({ item: category }: { item: string }) => (
      <CategoryListItem
        category={category}
        isSelected={selectedCategories.includes(category)}
        onToggle={handleToggleCategory}
      />
    ),
    [selectedCategories, handleToggleCategory]
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
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  categoryItem: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginVertical: SPACING.xs,
    padding: SPACING.md,
  },
  listContentContainer: {
    paddingBottom: SPACING.lg, // Extra padding at the bottom for safe area
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
});

export default CategoryListBottomSheet;
