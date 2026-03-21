/**
 * @fileoverview Gesture selection card for the sponsorship wizard.
 *
 * Displays a single gesture with its name, categories, and concepts.
 * Supports selected/disabled states for the gesture selection step.
 *
 * @example
 * <SponsorGestureCard
 *   gesture={gesture}
 *   isSelected={selectedIds.includes(gesture._id)}
 *   isDisabled={gesture.status !== "available"}
 *   onToggle={() => handleToggle(gesture._id)}
 * />
 */

import type { GestureWithSponsorshipStatus } from "@smog/ui";
import { Check, Heart } from "lucide-react";

interface SponsorGestureCardProps {
  gesture: GestureWithSponsorshipStatus;
  isSelected: boolean;
  onToggle: () => void;
  isDisabled: boolean;
}

/**
 * A conversion-focused gesture card for the sponsor selection grid.
 *
 * Shows:
 * - A status badge ("Gesponsord" / "In behandeling") for non-available gestures
 * - A checkbox indicator for the selected state
 * - Gesture name, category chips, and concept preview
 *
 * @props
 * - `gesture` — The gesture data including status and categories
 * - `isSelected` — Whether this gesture is currently selected
 * - `isDisabled` — Whether selection is prevented (sponsored / pending)
 * - `onToggle` — Called when the card is clicked
 */
export function SponsorGestureCard({
  gesture,
  isSelected,
  onToggle,
  isDisabled,
}: SponsorGestureCardProps) {
  return (
    <button
      className={`group relative w-full overflow-hidden rounded-xl border bg-card p-4 text-left transition-all ${
        isDisabled
          ? "cursor-not-allowed border-border/50 opacity-50"
          : isSelected
            ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/20"
            : "border-border hover:border-primary/50 hover:shadow-md"
      }`}
      disabled={isDisabled}
      onClick={onToggle}
      type="button"
    >
      {/* Status badge — top left */}
      {gesture.status !== "available" && (
        <div className="absolute top-2 left-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-xs ${
              gesture.status === "sponsored"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {gesture.status === "sponsored" ? (
              <>
                <Heart className="h-3 w-3 fill-current" />
                Gesponsord
              </>
            ) : (
              "In behandeling"
            )}
          </span>
        </div>
      )}

      {/* Selection checkbox — top right */}
      {!isDisabled && (
        <div
          className={`absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
            isSelected
              ? "border-primary bg-primary"
              : "border-muted-foreground/30 bg-background group-hover:border-primary/50"
          }`}
        >
          {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
        </div>
      )}

      {/* Content */}
      <div className={gesture.status !== "available" ? "mt-8" : "mt-0"}>
        <h3 className="pr-8 font-semibold text-base leading-tight">
          {gesture.name}
        </h3>

        {/* Categories */}
        {gesture.categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {gesture.categories.slice(0, 2).map((cat) => (
              <span
                className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs"
                key={cat._id}
              >
                {cat.name}
              </span>
            ))}
            {gesture.categories.length > 2 && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                +{gesture.categories.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Concepts preview */}
        {gesture.concept.length > 0 && (
          <p className="mt-2 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            {gesture.concept.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>

      {/* Selection highlight overlay */}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-primary/5" />
      )}
    </button>
  );
}
