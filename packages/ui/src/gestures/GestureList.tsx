import { Heart } from "lucide-react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { GestureCardData } from "./GestureCard";

export type GestureListData = {
  gestures: GestureCardData[];
  isDone?: boolean;
  continueCursor?: string;
};

type GestureListProps = {
  gestures: GestureCardData[];
  isLoading?: boolean;
  error?: Error | null;
  selectedGestureId?: string | null;
  onSelectGesture: (gestureId: string) => void;
  sortColumn?: "name" | "category";
  sortDirection?: "asc" | "desc";
  onSort?: (column: "name" | "category") => void;
  favoriteGestureIds?: string[];
  onToggleFavorite?: (gestureId: string) => void;
};

function GestureTableRow({
  gesture,
  isSelected,
  onClick,
  isFavorite,
  onToggleFavorite,
}: {
  gesture: GestureCardData;
  isSelected: boolean;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
}) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(gesture._id);
    }
  };

  return (
    <TableRow
      className={`cursor-pointer ${isSelected ? "bg-[var(--primary)]/10" : ""}`}
      onClick={onClick}
    >
      <TableCell className="font-medium">{gesture.name}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {gesture.categories
            .filter(Boolean)
            .slice(0, 2)
            .map((cat) =>
              cat ? (
                <span
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                  key={cat._id}
                >
                  {cat.name}
                </span>
              ) : null
            )}
          {gesture.categories.length > 2 ? (
            <span className="text-muted-foreground text-xs">
              +{gesture.categories.length - 2}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
        {gesture.concept.join(", ")}
      </TableCell>
      {onToggleFavorite ? (
        <TableCell className="w-12">
          <button
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            className="rounded-full p-1 transition-all hover:scale-110 hover:bg-muted"
            onClick={handleFavoriteClick}
            type="button"
          >
            <Heart
              className={`h-5 w-5 transition-all ${
                isFavorite
                  ? "fill-[#FF3B7D] stroke-[#FF3B7D]"
                  : "fill-none stroke-[var(--primary)] hover:fill-[var(--primary)]/20"
              }`}
            />
          </button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function GestureTableHeader({
  sortColumn,
  sortDirection,
  onSort,
  showFavoriteColumn,
}: {
  sortColumn: "name" | "category";
  sortDirection: "asc" | "desc";
  onSort?: (column: "name" | "category") => void;
  showFavoriteColumn?: boolean;
}) {
  const sortableClass = onSort
    ? "cursor-pointer select-none hover:bg-muted/50"
    : "";

  const renderSortIndicator = (column: "name" | "category") => {
    if (!onSort || sortColumn !== column) {
      return null;
    }
    return (
      <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
    );
  };

  const handleNameClick = onSort ? () => onSort("name") : undefined;
  const handleCategoryClick = onSort ? () => onSort("category") : undefined;

  return (
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow>
        <TableHead className={sortableClass} onClick={handleNameClick}>
          <div className="flex items-center gap-1">
            Name
            {renderSortIndicator("name")}
          </div>
        </TableHead>
        <TableHead className={sortableClass} onClick={handleCategoryClick}>
          <div className="flex items-center gap-1">
            Category
            {renderSortIndicator("category")}
          </div>
        </TableHead>
        <TableHead>Concepts</TableHead>
        {showFavoriteColumn === true && <TableHead className="w-12" />}
      </TableRow>
    </TableHeader>
  );
}

export function GestureList({
  gestures,
  isLoading = false,
  error = null,
  selectedGestureId = null,
  onSelectGesture,
  sortColumn = "name",
  sortDirection = "asc",
  onSort,
  favoriteGestureIds = [],
  onToggleFavorite,
}: GestureListProps) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="font-semibold text-[var(--error)]">
            Error loading gestures
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Please try again later.
          </p>
        </div>
      </div>
    );
  }

  if (gestures.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">No gestures found.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <GestureTableHeader
          onSort={onSort}
          showFavoriteColumn={!!onToggleFavorite}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />
        <TableBody>
          {gestures.map((gesture) => (
            <GestureTableRow
              gesture={gesture}
              isFavorite={favoriteGestureIds.includes(gesture._id)}
              isSelected={selectedGestureId === gesture._id}
              key={gesture._id}
              onClick={() => onSelectGesture(gesture._id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </TableBody>
      </table>
    </div>
  );
}
