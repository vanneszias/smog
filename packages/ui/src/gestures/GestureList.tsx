import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { GestureCardData } from "./GestureCard";

export interface GestureListData {
  gestures: GestureCardData[];
  isDone?: boolean;
  continueCursor?: string;
}

interface GestureListProps {
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
}

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
  const { t } = useTranslation();

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(gesture._id);
    }
  };

  return (
    <TableRow
      className={`cursor-pointer ${isSelected ? "bg-primary/10" : ""}`}
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
              isFavorite
                ? t("ui.gestureList.removeFromFavorites")
                : t("ui.gestureList.addToFavorites")
            }
            className="rounded-full p-1 transition-all hover:scale-110 hover:bg-muted"
            onClick={handleFavoriteClick}
            type="button"
          >
            <Heart
              className={`h-5 w-5 transition-all ${
                isFavorite
                  ? "fill-[#FF3B7D] stroke-[#FF3B7D]"
                  : "fill-none stroke-primary hover:fill-(--primary)/20"
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
  const { t } = useTranslation();

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
            {t("ui.gestureList.name")}
            {renderSortIndicator("name")}
          </div>
        </TableHead>
        <TableHead className={sortableClass} onClick={handleCategoryClick}>
          <div className="flex items-center gap-1">
            {t("ui.gestureList.category")}
            {renderSortIndicator("category")}
          </div>
        </TableHead>
        <TableHead>{t("ui.gestureList.concepts")}</TableHead>
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
  const { t } = useTranslation();

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
    <div className="relative flex h-full max-h-full w-full flex-col overflow-hidden px-4">
      <div className="min-h-0 flex-1 overflow-auto">
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
    </div>
  );
}
