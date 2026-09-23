import { Pressable, View, type ViewProps } from "react-native";
import { buttonVariants } from "../components/Button";
import { Text } from "../components/Text";
import { cn } from "../lib/cn";

export interface CategoryOption {
  id: string;
  name: string;
}

export type CategoryFilterProps = Omit<ViewProps, "children"> & {
  categories: readonly CategoryOption[];
  /**
   * The single selected category id, or `null` for "all". A phone filter is
   * one chip row with an implicit "all" chip, not the multi-select checklist
   * web's `CategoryFilter` renders — so this holds one id, not an array.
   */
  selected: string | null;
  /**
   * Called with the id pressed, or `null` when the pressed chip was already
   * selected — a filter a reader cannot turn back off is the bug this
   * guards. Never called with a category the component has no chip for.
   */
  onChange: (id: string | null) => void;
  allLabel?: string;
  className?: string;
};

/**
 * One chip per category, plus an "all" chip that is selected whenever
 * `selected` is `null` — including a `selected` id that names a category
 * this render was not given, which must not read as "nothing chosen".
 *
 * `accessibilityRole="button"` with `accessibilityState.selected`, the same
 * pairing `GestureCard`'s favourite control uses: a chip's label never
 * changes between its two states, only its selected state does.
 */
export function CategoryFilter({
  allLabel = "Alles",
  categories,
  className,
  onChange,
  selected,
  testID = "root",
  ...props
}: CategoryFilterProps) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn("flex-row flex-wrap items-center gap-sm", className)}
      testID={testID}
      {...props}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: selected === null }}
        className={buttonVariants({
          size: "sm",
          variant: selected === null ? "primary" : "outline",
        })}
        onPress={() => onChange(null)}
        testID={`${testID}-all`}
      >
        <Text
          className={
            selected === null ? "text-primary-foreground" : "text-foreground"
          }
        >
          {allLabel}
        </Text>
      </Pressable>
      {categories.map((category) => {
        const isSelected = category.id === selected;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={buttonVariants({
              size: "sm",
              variant: isSelected ? "primary" : "outline",
            })}
            key={category.id}
            onPress={() => onChange(isSelected ? null : category.id)}
            testID={`${testID}-${category.id}`}
          >
            <Text
              className={
                isSelected ? "text-primary-foreground" : "text-foreground"
              }
            >
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
