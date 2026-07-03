/**
 * @fileoverview Step 1 of the sponsorship wizard — gesture selection.
 *
 * Renders the hero header with value props, category filter bar, gesture grid,
 * and floating selection bar. All state is received via props from `SponsorsComponent`.
 */

import type { GestureWithSponsorshipStatus } from "@smog/ui";
import { Loader2, Search, X } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  formatPrice,
  LOGO_ADDON_CENTS,
  PRICE_PER_YEAR_CENTS,
} from "@/lib/pricing";
import { SelectionBar } from "./-SelectionBar";
import { SponsorGestureCard } from "./-SponsorGestureCard";

interface StepSelectProps {
  filteredGestures: GestureWithSponsorshipStatus[];
  selectedGestureIds: string[];
  isLoading: boolean;
  error: Error | null | undefined;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategories: string[];
  categoryNames: string[];
  handleCategoryToggle: (cat: string) => void;
  handleClearFilters: () => void;
  handleToggleSelection: (id: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  totalCents: number;
  onContinue: () => void;
}

/**
 * Gesture selection step of the sponsorship wizard.
 *
 * Shows:
 * - Hero header with pricing value props
 * - Search bar + category filter chips
 * - Gesture grid with status badges and selection checkboxes
 * - Floating bottom bar summarising current selection
 */
export function StepSelect({
  filteredGestures,
  selectedGestureIds,
  isLoading,
  error,
  searchQuery,
  setSearchQuery,
  selectedCategories,
  categoryNames,
  handleCategoryToggle,
  handleClearFilters,
  handleToggleSelection,
  showFilters,
  setShowFilters,
  totalCents,
  onContinue,
}: StepSelectProps) {
  const { i18n, t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const availableCount = filteredGestures.filter(
    (g) => g.status === "available"
  ).length;

  return (
    <>
      {/* Header */}
      <header className="border-border border-b bg-gradient-to-b from-background to-muted/20 px-4 pt-safe-top">
        <div className="mx-auto max-w-6xl py-8">
          {/* Main heading */}
          <div className="mb-6 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <svg
                aria-hidden="true"
                className="h-8 w-8 fill-primary text-primary"
                viewBox="0 0 24 24"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <h1 className="font-bold text-4xl tracking-tight md:text-5xl">
              {t("web.sponsors.wizard.selection.title")}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
              {t("web.sponsors.wizard.selection.description")}
            </p>
          </div>

          {/* Value props */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="mb-2 font-bold text-2xl text-primary">
                {formatPrice(
                  PRICE_PER_YEAR_CENTS,
                  i18n.resolvedLanguage ?? i18n.language
                )}
              </div>
              <div className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.selection.perGesture")}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="mb-2 font-bold text-2xl text-primary">5 sec</div>
              <div className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.selection.nameInVideo")}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="mb-2 font-bold text-2xl text-primary">
                +
                {formatPrice(
                  LOGO_ADDON_CENTS,
                  i18n.resolvedLanguage ?? i18n.language
                )}
              </div>
              <div className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.selection.optionalLogo")}
              </div>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mx-auto px-2 pb-6 lg:px-8">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label={t("search.inputLabel")}
              className="h-12 w-full rounded-xl border border-border bg-background pr-4 pl-12 text-base shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("web.sponsors.wizard.selection.searchPlaceholder")}
              ref={searchInputRef}
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label={t("search.clear")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {categoryNames.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-sm">
                  {t("web.sponsors.wizard.selection.categories")}
                </span>
                {selectedCategories.length > 0 && (
                  <button
                    className="text-primary text-sm hover:underline"
                    onClick={handleClearFilters}
                    type="button"
                  >
                    {t("ui.gestureFilters.clearFilters")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {categoryNames
                  .slice(0, showFilters ? undefined : 8)
                  .map((category) => {
                    const isSelected = selectedCategories.includes(category);
                    return (
                      <button
                        className={`rounded-lg px-3 py-1.5 font-medium text-sm transition-all ${
                          isSelected
                            ? "bg-primary text-white shadow-sm"
                            : "border border-border bg-background hover:border-primary/50"
                        }`}
                        key={category}
                        onClick={() => handleCategoryToggle(category)}
                        type="button"
                      >
                        {category}
                      </button>
                    );
                  })}
                {categoryNames.length > 8 && (
                  <button
                    className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-sm hover:border-primary/50"
                    onClick={() => setShowFilters(!showFilters)}
                    type="button"
                  >
                    {showFilters
                      ? t("web.sponsors.wizard.selection.showLess")
                      : t("web.sponsors.wizard.selection.showMore", {
                          count: categoryNames.length - 8,
                        })}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Results count */}
      <div className="mx-auto px-4 py-4 md:px-12">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {t("web.sponsors.wizard.selection.available", {
              count: availableCount,
            })}
            {selectedGestureIds.length > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-primary">
                  {t("web.sponsors.wizard.selection.selected", {
                    count: selectedGestureIds.length,
                  })}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Gesture grid */}
      <div className="pb-32">
        <div className="mx-auto px-4 md:px-12">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <p className="font-semibold text-destructive">
                {t("ui.gestureList.errorLoading")}
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                {t("ui.gestureList.errorTryAgain")}
              </p>
            </div>
          ) : filteredGestures.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <p className="text-muted-foreground">
                {t("ui.gestureList.noGestures")}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredGestures.map((gesture) => {
                const isDisabled =
                  gesture.status === "sponsored" ||
                  gesture.status === "pending";
                const isSelected = selectedGestureIds.includes(gesture._id);
                return (
                  <SponsorGestureCard
                    gesture={gesture}
                    isDisabled={isDisabled}
                    isSelected={isSelected}
                    key={gesture._id}
                    onToggle={() => {
                      if (!isDisabled) {
                        handleToggleSelection(gesture._id);
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SelectionBar
        count={selectedGestureIds.length}
        onContinue={onContinue}
        totalCents={
          totalCents ?? selectedGestureIds.length * PRICE_PER_YEAR_CENTS
        }
      />
    </>
  );
}
