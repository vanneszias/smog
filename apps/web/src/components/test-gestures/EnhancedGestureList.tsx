import type { GestureDetailData } from "@smog/ui";
import { Heart } from "lucide-react";

interface EnhancedGestureListProps {
  gestures: GestureDetailData[];
  selectedGestureId: string | null;
  onSelectGesture: (gestureId: string) => void;
  favoriteGestureIds?: string[];
  onToggleFavorite?: (gestureId: string) => void;
}

interface GestureRowProps {
  gesture: GestureDetailData;
  isSelected: boolean;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
}

function GestureRow({
  gesture,
  isSelected,
  onClick,
  isFavorite,
  onToggleFavorite,
}: GestureRowProps) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(gesture._id);
    }
  };

  return (
    <button
      className={`group flex min-h-[60px] w-full cursor-pointer items-center gap-4 border-border border-b px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
        isSelected
          ? "border-l-4 border-l-primary bg-primary/5"
          : "border-l-4 border-l-transparent"
      }`}
      onClick={onClick}
      type="button"
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

      {/* Favorite button */}
      {onToggleFavorite && (
        <button
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all hover:scale-110 hover:bg-muted"
          onClick={handleFavoriteClick}
          type="button"
        >
          <Heart
            className={`h-6 w-6 transition-all ${
              isFavorite
                ? "fill-[#FF3B7D] stroke-[#FF3B7D]"
                : "fill-none stroke-primary hover:fill-primary/20"
            }`}
          />
        </button>
      )}
    </button>
  );
}

export function EnhancedGestureList({
  gestures,
  selectedGestureId,
  onSelectGesture,
  favoriteGestureIds = [],
  onToggleFavorite,
}: EnhancedGestureListProps) {
  if (gestures.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">No gestures found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Results count */}
      <div className="shrink-0 border-border border-b px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {gestures.length} {gestures.length === 1 ? "gesture" : "gestures"}{" "}
          found
        </p>
      </div>

      {/* Gesture list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {gestures.map((gesture) => (
          <GestureRow
            gesture={gesture}
            isFavorite={favoriteGestureIds.includes(gesture._id)}
            isSelected={selectedGestureId === gesture._id}
            key={gesture._id}
            onClick={() => {
              onSelectGesture(gesture._id);
            }}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
