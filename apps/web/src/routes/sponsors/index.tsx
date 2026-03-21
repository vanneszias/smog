/**
 * @fileoverview Sponsors page — three-step sponsorship wizard.
 *
 * This is the main entry point for the sponsor purchase flow. It orchestrates
 * three focused step components and delegates all logic to dedicated hooks:
 *
 * Steps:
 * 1. `StepSelect`   — Browse and select gestures to sponsor
 * 2. `StepDetails`  — Enter sponsor name, logo, contact, and invoice details
 * 3. `StepPreview`  — Review pre-composed preview videos and pay
 *
 * State:
 * - `useSponsorshipForm` — all form fields + wizard step
 * - `useGestureFiltering` — search + category filters for gesture list
 * - `useGeneratePreview` — generates preview videos (step 2 → 3 transition)
 * - `useCreateSponsorship` — creates sponsorships + redirects to Mollie payment
 *
 * @see components/StepSelect.tsx
 * @see components/StepDetails.tsx
 * @see components/StepPreview.tsx
 * @see hooks/useSponsorshipForm.ts
 * @see hooks/useSponsorshipMutation.ts
 */

import { api } from "@smog/convex";
import { useGestureFiltering } from "@smog/hooks";
import type { GestureWithSponsorshipStatus } from "@smog/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateSimplifiedPrice } from "@/lib/pricing";
import { orpc } from "@/utils/orpc";
import { StepDetails } from "./components/-StepDetails";
import { StepPreview } from "./components/-StepPreview";
import { StepSelect } from "./components/-StepSelect";
import { useSponsorshipForm } from "./hooks/-useSponsorshipForm";
import {
  useCreateSponsorship,
  useGeneratePreview,
} from "./hooks/-useSponsorshipMutation";

// ─── Route definition ─────────────────────────────────────────────────────────

interface SearchParams {
  gestureId?: string;
}

export const Route = createFileRoute("/sponsors/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    gestureId: (search.gestureId as string) || undefined,
  }),
  component: SponsorsComponent,
});

// ─── Page component ───────────────────────────────────────────────────────────

/**
 * Main sponsors page component.
 *
 * Keeps only page-level orchestration: data fetching, transformation, and
 * wiring the step components together. All UI is in step components; all
 * business logic is in hooks.
 */
function SponsorsComponent() {
  const searchParams = Route.useSearch();
  const form = useSponsorshipForm();
  const [showFilters, setShowFilters] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: gesturesWithSponsorship,
    isLoading,
    error,
  } = useQuery(orpc.sponsorships.listGesturesWithSponsorship.queryOptions());

  const allCategories = useConvexQuery(api.categories.list) ?? [];

  // ─── Data transformation ───────────────────────────────────────────────────

  const gesturesWithCategories = useMemo(() => {
    if (!gesturesWithSponsorship) {
      return [];
    }
    return gesturesWithSponsorship.map((gesture) => ({
      ...gesture,
      categories: gesture.categoryIds
        .map((catId) => allCategories.find((cat) => cat._id === catId))
        .filter((cat): cat is NonNullable<typeof cat> => Boolean(cat)),
    }));
  }, [gesturesWithSponsorship, allCategories]);

  const gesturesForList: GestureWithSponsorshipStatus[] = useMemo(() => {
    return gesturesWithCategories.map((gesture) => {
      let status: "available" | "sponsored" | "pending" = "available";
      let sponsorName: string | undefined;
      let endDate: number | undefined;

      if (gesture.sponsorship) {
        if (gesture.sponsorship.status === "active") {
          status = "sponsored";
          sponsorName = gesture.sponsorship.sponsorName;
          endDate = gesture.sponsorship.endDate;
        } else if (
          gesture.sponsorship.status === "pending" ||
          gesture.sponsorship.status === "pending_payment" ||
          gesture.sponsorship.status === "pending_approval"
        ) {
          status = "pending";
        }
      }

      return {
        _id: gesture._id,
        name: gesture.name,
        playbackId: gesture.playbackId,
        info: gesture.info,
        categories: gesture.categories,
        concept: gesture.concept,
        status,
        sponsorName,
        endDate,
      };
    });
  }, [gesturesWithCategories]);

  // ─── Filtering ─────────────────────────────────────────────────────────────

  const {
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle,
    allCategories: categoryNames,
    filteredGestures,
  } = useGestureFiltering({ gestures: gesturesForList });

  // ─── Derived state ─────────────────────────────────────────────────────────

  const selectedGestures = useMemo(
    () =>
      gesturesForList.filter((g) => form.selectedGestureIds.includes(g._id)),
    [gesturesForList, form.selectedGestureIds]
  );

  const pricing = useMemo(
    () =>
      calculateSimplifiedPrice(
        form.selectedGestureIds.length,
        form.includeLogo
      ),
    [form.selectedGestureIds.length, form.includeLogo]
  );

  // ─── URL pre-selection ─────────────────────────────────────────────────────

  useEffect(() => {
    if (
      searchParams.gestureId &&
      gesturesForList.length > 0 &&
      form.selectedGestureIds.length === 0
    ) {
      const gesture = gesturesForList.find(
        (g) => g._id === searchParams.gestureId
      );
      if (gesture?.status === "available") {
        form.setSelectedGestureIds([searchParams.gestureId]);
      }
    }
  }, [
    searchParams.gestureId,
    gesturesForList,
    form.selectedGestureIds.length,
    form.setSelectedGestureIds,
  ]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    for (const cat of selectedCategories) {
      handleCategoryToggle(cat);
    }
  }, [setSearchQuery, selectedCategories, handleCategoryToggle]);

  const handleGeneratePreview = useGeneratePreview({ form, selectedGestures });
  const handleProceedToPayment = useCreateSponsorship({
    form,
    totalCents: pricing.totalCents,
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-full bg-background">
      {/* Shared CSS animations used by progress buttons */}
      <style>{`
        .pb-safe-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
        .progress-button { position: relative; overflow: hidden; }
        .progress-button::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 100%);
          transform: translateX(-100%);
          transition: transform 0.3s ease-out;
        }
        .progress-button[data-progress]::before {
          transform: translateX(calc(-100% + var(--progress, 0) * 100%));
        }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      {form.currentStep === "select" && (
        <StepSelect
          categoryNames={categoryNames}
          error={error}
          filteredGestures={filteredGestures}
          handleCategoryToggle={handleCategoryToggle}
          handleClearFilters={handleClearFilters}
          handleToggleSelection={form.handleToggleSelection}
          isLoading={isLoading}
          onContinue={() => form.setCurrentStep("details")}
          searchQuery={searchQuery}
          selectedCategories={selectedCategories}
          selectedGestureIds={form.selectedGestureIds}
          setSearchQuery={setSearchQuery}
          setShowFilters={setShowFilters}
          showFilters={showFilters}
          totalCents={pricing.totalCents}
        />
      )}

      {form.currentStep === "details" && (
        <StepDetails
          form={form}
          onGeneratePreview={handleGeneratePreview}
          selectedGestures={selectedGestures}
        />
      )}

      {form.currentStep === "preview" && form.previewPlaybackIds.length > 0 && (
        <StepPreview
          form={form}
          onProceedToPayment={handleProceedToPayment}
          selectedGestures={selectedGestures}
          totalCents={pricing.totalCents}
        />
      )}
    </div>
  );
}
