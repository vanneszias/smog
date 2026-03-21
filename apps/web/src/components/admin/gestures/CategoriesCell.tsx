/**
 * @fileoverview Inline category multi-select cell for the gesture admin table.
 *
 * In read mode: shows selected category badges. Click to enter edit mode.
 * In edit mode: shows a toggleable list of all active categories.
 *
 * @example
 * <CategoriesCell
 *   categoryIds={gesture.categoryIds}
 *   categories={allCategories}
 *   onChange={(ids) => updateField("categoryIds", ids)}
 * />
 */

import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminCategory } from "./types";

interface CategoriesCellProps {
  categoryIds: string[];
  categories: AdminCategory[];
  onChange: (categoryIds: string[]) => void;
}

/**
 * Click-to-edit category multi-select cell.
 * Shows selected category badges in read mode; toggle buttons in edit mode.
 */
export function CategoriesCell({
  categoryIds,
  categories,
  onChange,
}: CategoriesCellProps) {
  const [isEditing, setIsEditing] = useState(false);

  const toggleCategory = (categoryId: string) => {
    if (categoryIds.includes(categoryId)) {
      onChange(categoryIds.filter((id) => id !== categoryId));
    } else {
      onChange([...categoryIds, categoryId]);
    }
  };

  const selectedCategories = categories.filter((c) =>
    categoryIds.includes(c._id)
  );

  if (isEditing) {
    return (
      <div className="min-w-[200px] space-y-2">
        <div className="flex max-h-[150px] flex-wrap gap-1 overflow-y-auto">
          {categories
            .filter((c) => c.isActive)
            .map((category) => {
              const isSelected = categoryIds.includes(category._id);
              return (
                <button
                  className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                  key={category._id}
                  onClick={() => toggleCategory(category._id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCategory(category._id);
                    }
                  }}
                  type="button"
                >
                  {isSelected && <Check className="mr-1 h-3 w-3" />}
                  {category.name}
                </button>
              );
            })}
        </div>
        <Button
          className="h-6 px-2 text-xs"
          onClick={() => setIsEditing(false)}
          size="sm"
          variant="ghost"
        >
          <Check className="mr-1 h-3 w-3" />
          Done
        </Button>
      </div>
    );
  }

  return (
    <button
      className="flex min-w-[120px] cursor-pointer flex-wrap gap-1 text-left hover:opacity-70"
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      type="button"
    >
      {selectedCategories.length === 0 ? (
        <span className="text-[var(--admin-text-muted)] text-xs italic">
          Click to select...
        </span>
      ) : (
        selectedCategories.map((cat) => (
          <Badge className="text-xs" key={cat._id} variant="secondary">
            {cat.name}
          </Badge>
        ))
      )}
    </button>
  );
}
