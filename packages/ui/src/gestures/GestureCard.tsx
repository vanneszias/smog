import MuxPlayer from "@mux/mux-player-react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface GestureCardData {
  _id: string;
  name: string;
  playbackId: string;
  concept: string[];
  info: string;
  categories: Array<{ _id: string; name: string } | undefined>;
}

interface GestureCardProps {
  gesture: GestureCardData;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
}

export function GestureCard({
  gesture,
  isFavorite: _isFavorite = false,
  onToggleFavorite,
}: GestureCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useTranslation();

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(gesture._id);
    }
  };

  return (
    <Link
      className="group relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      params={{ id: gesture._id }}
      to="/gestures/$id"
    >
      <div
        className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:shadow-lg"
        style={{
          boxShadow: isHovered
            ? "0 4px 8px rgba(0, 128, 95, 0.12)"
            : "0 2px 4px rgba(0, 128, 95, 0.08)",
        }}
      >
        {/* Video Section */}
        <div className="relative aspect-video overflow-hidden bg-muted">
          {gesture.playbackId ? (
            <MuxPlayer
              className="h-full w-full"
              loop
              muted
              playbackId={gesture.playbackId}
              streamType="on-demand"
              style={{ height: "100%", width: "100%" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              {t("ui.gestureDetail.noVideo")}
            </div>
          )}

          {/* Favorite Button Overlay */}
          {onToggleFavorite ? (
            <button
              aria-label={t("ui.gestureList.addToList", "Add to list")}
              className="absolute top-3 right-3 rounded-full bg-background/80 p-2 backdrop-blur-sm transition-all hover:scale-110 hover:bg-background"
              onClick={handleFavoriteClick}
              type="button"
            >
              <Plus className="h-5 w-5 stroke-[var(--primary)] transition-all hover:stroke-[var(--primary)]/80" />
            </button>
          ) : null}
        </div>

        {/* Content Section */}
        <div className="p-4">
          <h3 className="mb-2 font-semibold text-lg transition-colors group-hover:text-[var(--primary)]">
            {gesture.name}
          </h3>

          {/* Categories */}
          <div className="mb-2 flex flex-wrap gap-2">
            {gesture.categories.filter(Boolean).map((cat) => (
              <span
                className="rounded-full px-2 py-1 font-medium text-xs"
                key={cat!._id}
                style={{
                  backgroundColor: "var(--secondary)",
                  color: "var(--text)",
                }}
              >
                {cat!.name}
              </span>
            ))}
          </div>

          {/* Concepts */}
          {gesture.concept.length > 0 ? (
            <p className="line-clamp-2 text-muted-foreground text-sm">
              {gesture.concept.join(", ")}
            </p>
          ) : null}

          {/* Info */}
          {gesture.info ? (
            <p className="mt-2 line-clamp-1 text-muted-foreground text-xs">
              {gesture.info}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
