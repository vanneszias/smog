import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface GestureWithSponsorshipStatus {
  _id: string;
  name: string;
  playbackId: string;
  info: string;
  categories: Array<{ _id: string; name: string }>;
  concept: string[];
  status: "available" | "sponsored" | "pending";
  sponsorName?: string;
  endDate?: number;
}

interface SponsorshipListProps {
  gestures: GestureWithSponsorshipStatus[];
  isLoading?: boolean;
  error?: Error | null;
  selectedGestureIds: string[];
  onToggleSelection: (gestureId: string) => void;
}

function SponsorshipRow({
  gesture,
  isSelected,
  onToggle,
  isDisabled,
}: {
  gesture: GestureWithSponsorshipStatus;
  isSelected: boolean;
  onToggle: () => void;
  isDisabled: boolean;
}) {
  const { t } = useTranslation();

  const getStatusBadge = () => {
    if (gesture.status === "sponsored") {
      return (
        <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800 text-xs dark:bg-green-900 dark:text-green-200">
          {t("web.sponsors.new.status.sponsored", {
            name: gesture.sponsorName || "Unknown",
          })}
        </span>
      );
    }

    if (gesture.status === "pending") {
      return (
        <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          {t("web.sponsors.new.status.pending")}
        </span>
      );
    }

    return (
      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800 text-xs dark:bg-blue-900 dark:text-blue-200">
        {t("web.sponsors.new.status.available")}
      </span>
    );
  };

  return (
    <button
      className={`group flex min-h-[60px] w-full items-center gap-4 border-border border-b px-4 py-3 text-left transition-colors ${
        isDisabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-muted/30"
      } ${
        isSelected
          ? "border-l-4 border-l-primary bg-primary/5"
          : "border-l-4 border-l-transparent"
      }`}
      disabled={isDisabled}
      onClick={onToggle}
      type="button"
    >
      {/* Checkbox */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-all ${
            isSelected
              ? "border-primary bg-primary"
              : "border-muted-foreground bg-background"
          } ${isDisabled ? "" : "group-hover:border-primary"}`}
        >
          {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
        </div>
      </div>

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

      {/* Status badge */}
      <div className="shrink-0">{getStatusBadge()}</div>
    </button>
  );
}

export function SponsorshipList({
  gestures,
  isLoading = false,
  error = null,
  selectedGestureIds,
  onToggleSelection,
}: SponsorshipListProps) {
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Results count */}
      <div className="shrink-0 border-border border-b px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {gestures.length} {gestures.length === 1 ? "gesture" : "gestures"}{" "}
          found
          {selectedGestureIds.length > 0 && (
            <span className="ml-2 font-semibold text-primary">
              ({selectedGestureIds.length} selected)
            </span>
          )}
        </p>
      </div>

      {/* Gesture list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {gestures.map((gesture) => {
          const isDisabled =
            gesture.status === "sponsored" || gesture.status === "pending";
          const isSelected = selectedGestureIds.includes(gesture._id);

          return (
            <SponsorshipRow
              gesture={gesture}
              isDisabled={isDisabled}
              isSelected={isSelected}
              key={gesture._id}
              onToggle={() => {
                if (!isDisabled) {
                  onToggleSelection(gesture._id);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
