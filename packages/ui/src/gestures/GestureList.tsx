import { Check, Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GestureCardData } from "./types";

interface GestureListProps {
  gestures: GestureCardData[];
  isLoading?: boolean;
  error?: Error | null;
  selectedGestureId?: string | null;
  onSelectGesture: (gestureId: string) => void;
  sortColumn?: "name" | "category";
  sortDirection?: "asc" | "desc";
  onSort?: (column: "name" | "category") => void;
  savedGestureIds?: string[];
  onToggleSaved?: (gestureId: string) => void;
}

function GestureRow({
  gesture,
  isSaved,
  isSelected,
  onClick,
  onToggleSaved,
}: {
  gesture: GestureCardData;
  isSelected: boolean;
  onClick: () => void;
  isSaved?: boolean;
  onToggleSaved?: (gestureId: string) => void;
}) {
  const { t } = useTranslation();

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleSaved) {
      onToggleSaved(gesture._id);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: cannot use <button> here — contains a nested <button> for the favorite toggle
    <div
      className={`group flex min-h-[60px] w-full cursor-pointer items-center gap-4 border-border border-b px-4 py-3 text-left transition-colors hover:bg-muted/30 lg:px-12 ${
        isSelected
          ? "border-l-4 border-l-primary bg-primary/5"
          : "border-l-4 border-l-transparent"
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Gesture name */}
        <div className="font-medium text-base" style={{ color: "var(--text)" }}>
          {gesture.name}
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-1.5">
          {gesture.categories
            .filter(Boolean)
            .slice(0, 3)
            .map((cat) =>
              cat ? (
                <span
                  className="rounded-full px-2.5 py-1 text-xs"
                  key={cat._id}
                  style={{
                    backgroundColor: "var(--secondary)",
                    color: "var(--text)",
                  }}
                >
                  {cat.name}
                </span>
              ) : null
            )}
          {gesture.categories.length > 3 && (
            <span
              className="rounded-full px-2.5 py-1 text-muted-foreground text-xs"
              style={{ backgroundColor: "var(--muted)" }}
            >
              +{gesture.categories.length - 3}
            </span>
          )}
        </div>

        {/* Concepts (visible on tablet+) */}
        {gesture.concept.length > 0 && (
          <div className="hidden truncate text-muted-foreground text-sm md:block">
            {gesture.concept.slice(0, 4).join(", ")}
            {gesture.concept.length > 4 && "..."}
          </div>
        )}
      </div>

      {/* Save-to-list button */}
      {onToggleSaved && (
        <button
          aria-label={
            isSaved
              ? t("ui.gestureList.addToAnotherList", "Add to another list")
              : t("ui.gestureList.addToList", "Add to list")
          }
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 ${
            isSaved
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-primary hover:bg-muted"
          }`}
          onClick={handleSaveClick}
          type="button"
        >
          {isSaved ? (
            <Check className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </button>
      )}
    </div>
  );
}

export function GestureList({
  gestures,
  isLoading = false,
  error = null,
  selectedGestureId = null,
  onSelectGesture,
  sortColumn: _sortColumn = "name",
  sortDirection: _sortDirection = "asc",
  onSort: _onSort,
  savedGestureIds = [],
  onToggleSaved,
}: GestureListProps) {
  const { t } = useTranslation();
  const savedGestureIdSet = useMemo(
    () => new Set(savedGestureIds),
    [savedGestureIds]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="font-semibold text-(--error)">
            {t("ui.gestureList.errorLoading")}
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            {t("ui.gestureList.errorTryAgain")}
          </p>
        </div>
      </div>
    );
  }

  if (gestures.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          {t("ui.gestureList.noGestures")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Gesture list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {gestures.map((gesture) => (
          <GestureRow
            gesture={gesture}
            isSaved={savedGestureIdSet.has(gesture._id)}
            isSelected={selectedGestureId === gesture._id}
            key={gesture._id}
            onClick={() => {
              onSelectGesture(gesture._id);
            }}
            onToggleSaved={onToggleSaved}
          />
        ))}
      </div>
    </div>
  );
}
