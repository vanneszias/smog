import { X } from "lucide-react";
import { useCallback } from "react";

interface CategoryFilterProps {
  categories: string[];
  className?: string;
  onCategoryToggle: (category: string) => void;
  selectedCategories: string[];
}

interface CategoryChipProps {
  category: string;
  isSelected: boolean;
  onToggle: (category: string) => void;
}

function CategoryChip({ category, isSelected, onToggle }: CategoryChipProps) {
  const handleClick = useCallback((): void => {
    onToggle(category);
  }, [onToggle, category]);

  return (
    <button
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-sm transition-all ${
        isSelected
          ? "text-white shadow-md"
          : "border border-border bg-card text-foreground hover:bg-muted"
      }`}
      onClick={handleClick}
      style={isSelected ? { backgroundColor: "var(--primary)" } : {}}
      type="button"
    >
      {category}
      {isSelected ? <X className="h-3 w-3" /> : null}
    </button>
  );
}

export default function CategoryFilter({
  categories,
  selectedCategories,
  onCategoryToggle,
  className = "",
}: CategoryFilterProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {categories.map((category) => (
        <CategoryChip
          category={category}
          isSelected={selectedCategories.includes(category)}
          key={category}
          onToggle={onCategoryToggle}
        />
      ))}
    </div>
  );
}
