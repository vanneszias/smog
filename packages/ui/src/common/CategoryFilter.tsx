import { X } from "lucide-react";

interface CategoryFilterProps {
  categories: string[];
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
  className?: string;
}

export default function CategoryFilter({
  categories,
  selectedCategories,
  onCategoryToggle,
  className = "",
}: CategoryFilterProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {categories.map((category) => {
        const isSelected = selectedCategories.includes(category);
        return (
          <button
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-sm transition-all ${
              isSelected
                ? "text-white shadow-md"
                : "border border-border bg-card text-foreground hover:bg-muted"
            }`}
            key={category}
            onClick={() => onCategoryToggle(category)}
            style={isSelected ? { backgroundColor: "var(--primary)" } : {}}
            type="button"
          >
            {category}
            {isSelected ? <X className="h-3 w-3" /> : null}
          </button>
        );
      })}
    </div>
  );
}
