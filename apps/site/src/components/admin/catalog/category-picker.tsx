import type { AdminCategory } from "@smog/admin/schema";
import { useTranslation } from "@smog/i18n/react";
import { Chip, Text } from "@smog/ui-web";
import { EyeOff } from "lucide-react";
import { type ReactNode, useCallback, useId } from "react";

export interface PickerCategory {
  id: string;
  name: string;
  /** Hidden categories are marked (a gesture may still be in one). */
  published: boolean;
}

/** The admin categories (`admin.categories.list`) as the picker shows them. */
export function pickerCategories(
  categories: readonly AdminCategory[]
): PickerCategory[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    published: category.publishedAt !== null,
  }));
}

export interface CategoryPickerProps {
  /** Every category in catalogue order (`useAdminCategories`, from D1). */
  categories: readonly PickerCategory[];
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  onChange: (ids: string[]) => void;
  value: readonly string[];
}

function CategoryChip({
  category,
  onToggle,
  selected,
}: {
  category: PickerCategory;
  onToggle: (id: string, selected: boolean) => void;
  selected: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const toggle = useCallback(
    (next: boolean) => onToggle(category.id, next),
    [category.id, onToggle]
  );
  return (
    <li>
      <Chip
        icon={category.published ? undefined : <EyeOff />}
        onSelectedChange={toggle}
        selected={selected}
        size="sm"
      >
        {category.name}
        {category.published ? null : (
          <span className="font-regular text-foreground-muted">
            {" "}
            ({t("admin.categories.hiddenMark")})
          </span>
        )}
      </Chip>
    </li>
  );
}

/**
 * The gesture's categories as toggle chips (at least one; ruling 8), in
 * catalogue order, hidden ones marked. The editor and the table editor use it.
 */
export function CategoryPicker({
  categories,
  error,
  hint,
  label,
  onChange,
  value,
}: CategoryPickerProps): ReactNode {
  const { t } = useTranslation();
  const errorId = useId();
  const chosen = new Set(value);
  const toggle = useCallback(
    (id: string, selected: boolean) => {
      // Keep catalogue order, whatever the click order.
      const next = new Set(value);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      onChange(
        categories.flatMap((category) =>
          next.has(category.id) ? [category.id] : []
        )
      );
    },
    [categories, onChange, value]
  );
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className="mb-1 font-medium text-body-sm text-foreground">
        {label}
      </legend>
      {categories.length === 0 ? (
        <Text size="body-sm" tone="muted">
          {t("admin.categories.empty.title")}
        </Text>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <CategoryChip
              category={category}
              key={category.id}
              onToggle={toggle}
              selected={chosen.has(category.id)}
            />
          ))}
        </ul>
      )}
      {error ? (
        <p
          className="text-body-sm text-danger-strong"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <Text size="body-sm" tone="muted">
          {hint}
        </Text>
      ) : null}
    </fieldset>
  );
}
