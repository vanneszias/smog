import MuxPlayer from "@mux/mux-player-react";
import { api } from "@smog/convex";
import { useGestureFiltering } from "@smog/hooks";
import type { GestureWithSponsorshipStatus } from "@smog/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Heart,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calculateSimplifiedPrice,
  formatPrice,
  LOGO_ADDON_CENTS,
  PRICE_PER_YEAR_CENTS,
} from "@/lib/pricing";
import { client, orpc } from "@/utils/orpc";

type WizardStep = "select" | "details" | "preview";

interface SearchParams {
  gestureId?: string;
}

export const Route = createFileRoute("/sponsors/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    gestureId: (search.gestureId as string) || undefined,
  }),
  component: SponsorsComponent,
});

// Gesture card - clean and conversion-focused
function GestureCard({
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
      {/* Status badge - top left */}
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

      {/* Selection checkbox - top right */}
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

      {/* Selection highlight */}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-primary/5" />
      )}
    </button>
  );
}

// Floating selection bar - clean and prominent
function SelectionBar({
  count,
  _total,
  onContinue,
}: {
  count: number;
  _total: number;
  onContinue: () => void;
}) {
  return (
    <div
      className={`fixed right-0 bottom-0 left-0 z-50 transform border-border border-t bg-background/95 shadow-2xl backdrop-blur-lg transition-all duration-300 ${
        count > 0
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto px-12 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Selection info */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-white">
              {count}
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {count} {count === 1 ? "gebaar" : "gebaren"} geselecteerd
              </p>
              <p className="text-muted-foreground text-sm">
                Totaal: {formatPrice(count * PRICE_PER_YEAR_CENTS)}
              </p>
            </div>
          </div>

          {/* Continue button */}
          <Button
            className="h-12 gap-2 rounded-lg px-8 font-semibold shadow-lg"
            onClick={onContinue}
            size="lg"
          >
            Doorgaan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-step wizard requires complex state management
function SponsorsComponent() {
  const { t } = useTranslation();
  const searchParams = Route.useSearch();

  // Wizard state - simplified to 3 steps
  const [currentStep, setCurrentStep] = useState<WizardStep>("select");

  // Form state
  const [selectedGestureIds, setSelectedGestureIds] = useState<string[]>([]);
  const [sponsorName, setSponsorName] = useState("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [contactFullName, setContactFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(
    null
  );
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentProgress, setPaymentProgress] = useState(0);
  const [errors, setErrors] = useState<{
    sponsorName?: string;
    logo?: string;
    contactFullName?: string;
    contactEmail?: string;
  }>({});

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch gestures with sponsorship status
  const {
    data: gesturesWithSponsorship,
    isLoading,
    error,
  } = useQuery(orpc.sponsorships.listGesturesWithSponsorship.queryOptions());

  // Fetch all categories using Convex
  const allCategories = useConvexQuery(api.categories.list) || [];

  // Transform data to include categories
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

  // Transform to the format expected by filtering
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

  // Gesture filtering
  const {
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle,
    allCategories: categoryNames,
    filteredGestures,
  } = useGestureFiltering({
    gestures: gesturesForList,
  });

  // Get selected gestures for form display
  const selectedGestures = useMemo(() => {
    return gesturesForList.filter((g) => selectedGestureIds.includes(g._id));
  }, [gesturesForList, selectedGestureIds]);

  // Calculate pricing
  const pricing = useMemo(() => {
    return calculateSimplifiedPrice(selectedGestureIds.length, includeLogo);
  }, [selectedGestureIds.length, includeLogo]);

  // Handle URL query param for pre-selection
  useEffect(() => {
    if (
      searchParams.gestureId &&
      gesturesForList.length > 0 &&
      selectedGestureIds.length === 0
    ) {
      const gesture = gesturesForList.find(
        (g) => g._id === searchParams.gestureId
      );
      if (gesture && gesture.status === "available") {
        setSelectedGestureIds([searchParams.gestureId]);
      }
    }
  }, [searchParams.gestureId, gesturesForList, selectedGestureIds.length]);

  // Toggle gesture selection
  const handleToggleSelection = useCallback((gestureId: string) => {
    setSelectedGestureIds((prev) =>
      prev.includes(gestureId)
        ? prev.filter((id) => id !== gestureId)
        : [...prev, gestureId]
    );
  }, []);

  // Handle logo upload
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrors((prev) => ({
          ...prev,
          logo: t("web.sponsors.new.validation.logoTooLarge"),
        }));
        return;
      }

      setLogoFile(file);
      setErrors((prev) => ({ ...prev, logo: undefined }));

      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    for (const cat of selectedCategories) {
      handleCategoryToggle(cat);
    }
  }, [setSearchQuery, selectedCategories, handleCategoryToggle]);

  // Validate details form
  const validateDetails = (): boolean => {
    const newErrors: typeof errors = {};

    if (!sponsorName.trim()) {
      newErrors.sponsorName = t(
        "web.sponsors.new.validation.sponsorNameRequired"
      );
    } else if (sponsorName.length > 35) {
      newErrors.sponsorName = t(
        "web.sponsors.new.validation.sponsorNameTooLong"
      );
    }

    if (includeLogo && !logoFile) {
      newErrors.logo = t("web.sponsors.new.validation.logoRequired");
    }

    if (!contactFullName.trim()) {
      newErrors.contactFullName = t(
        "web.sponsors.wizard.errors.fullNameRequired"
      );
    }

    if (!contactEmail.trim()) {
      newErrors.contactEmail = t("web.sponsors.wizard.errors.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      newErrors.contactEmail = t("web.sponsors.wizard.errors.emailInvalid");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Generate preview and proceed
  const handleGeneratePreviewAndProceed = async () => {
    if (!validateDetails()) {
      return;
    }

    setIsGeneratingPreview(true);
    setPreviewProgress(0);

    // Progress simulation - video generation takes time
    // Uses decelerating progress that slows as it approaches 90%
    const progressInterval = setInterval(() => {
      setPreviewProgress((prev) => {
        if (prev >= 0.9) {
          return prev;
        }
        // Slower progress as we get closer to 90%
        const remaining = 0.9 - prev;
        const increment = remaining * 0.08 * (0.3 + Math.random() * 0.7);
        return Math.min(prev + increment, 0.9);
      });
    }, 800);

    try {
      let logoBase64: string | undefined;
      if (includeLogo && logoFile) {
        setPreviewProgress(0.1);
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });
      }

      const firstGesture = selectedGestures[0];
      if (!firstGesture) {
        throw new Error("No gesture selected");
      }

      setPreviewProgress(0.2);
      const result = await client.sponsorships.generatePreview({
        gestureId: firstGesture._id,
        sponsorName,
        logoImage: logoBase64,
        overlayText: sponsorName,
      });

      setPreviewProgress(1);
      clearInterval(progressInterval);

      setPreviewPlaybackId(result.playbackId);
      setCurrentStep("preview");
    } catch (error) {
      console.error("[Sponsors] Failed to generate preview:", error);
      toast.error(t("web.sponsors.wizard.errors.previewFailed"));
    } finally {
      clearInterval(progressInterval);
      setIsGeneratingPreview(false);
      setPreviewProgress(0);
    }
  };

  // Handle final submission
  const handleProceedToPayment = async () => {
    setIsProcessing(true);
    setPaymentProgress(0);

    // Progress simulation - uses decelerating progress
    const progressInterval = setInterval(() => {
      setPaymentProgress((prev) => {
        if (prev >= 0.9) {
          return prev;
        }
        // Slower progress as we get closer to 90%
        const remaining = 0.9 - prev;
        const increment = remaining * 0.1 * (0.3 + Math.random() * 0.7);
        return Math.min(prev + increment, 0.9);
      });
    }, 600);

    try {
      let logoBase64: string | undefined;
      if (includeLogo && logoFile) {
        setPaymentProgress(0.15);
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });
      }

      setPaymentProgress(0.3);
      const result = await client.sponsorships.createBulkSponsorshipsSimplified(
        {
          gestureIds: selectedGestureIds,
          sponsorName,
          sponsorEmail: contactEmail,
          contactFullName,
          contactCompany: contactCompany || undefined,
          overlayText: sponsorName,
          logoImage: logoBase64,
          includeLogo,
          durationYears: 1,
          previewVideoPlaybackId: previewPlaybackId || "",
        }
      );

      setPaymentProgress(0.7);
      const payment = await client.sponsorships.createBulkPayment({
        sponsorshipIds: result.sponsorshipIds,
        amount: pricing.totalCents,
      });

      setPaymentProgress(1);
      clearInterval(progressInterval);

      window.location.href = payment.checkoutUrl;
    } catch (error) {
      console.error("Failed to create sponsorships:", error);
      toast.error(t("web.sponsors.wizard.errors.paymentFailed"));
      clearInterval(progressInterval);
      setIsProcessing(false);
      setPaymentProgress(0);
    }
  };

  // Available gestures count
  const availableCount = filteredGestures.filter(
    (g) => g.status === "available"
  ).length;

  return (
    <div className="relative min-h-full bg-background">
      {/* CSS for animations and utilities */}
      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-20px) scale(1.05); }
          }
          .pb-safe-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
          @keyframes progress-fill {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(0); }
          }
          .progress-button {
            position: relative;
            overflow: hidden;
          }
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
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>

      {/* Step 1: Select Gestures */}
      {currentStep === "select" && (
        <>
          {/* Header */}
          <header className="border-border border-b bg-gradient-to-b from-background to-muted/20 px-4 pt-safe-top">
            <div className="mx-auto max-w-6xl py-8">
              {/* Main heading with icon */}
              <div className="mb-6 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Heart className="h-8 w-8 fill-primary text-primary" />
                </div>
                <h1 className="font-bold text-4xl tracking-tight md:text-5xl">
                  Steun een gebaar
                </h1>
                <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
                  Word peter of meter van een gebaar. Jouw naam verschijnt in de
                  video en ondersteunt het SMOG-project voor 1 jaar.
                </p>
              </div>

              {/* Value props */}
              <div className="mb-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="mb-2 font-bold text-2xl text-primary">
                    €50
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Per gebaar per jaar
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="mb-2 font-bold text-2xl text-primary">
                    5 sec
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Jouw naam in elke video
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <div className="mb-2 font-bold text-2xl text-primary">
                    +€10
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Voeg je logo toe (optioneel)
                  </div>
                </div>
              </div>
            </div>

            {/* Search and filter section */}
            <div className="mx-auto px-2 pb-6 lg:px-8">
              {/* Search bar */}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="h-12 w-full rounded-xl border border-border bg-background pr-4 pl-12 text-base shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zoek op naam, concept of categorie..."
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                />
                {searchQuery && (
                  <button
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setSearchQuery("")}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Category filters - always visible */}
              {categoryNames.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-sm">Categorieën:</span>
                    {selectedCategories.length > 0 && (
                      <button
                        className="text-primary text-sm hover:underline"
                        onClick={handleClearFilters}
                        type="button"
                      >
                        Wis filters
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categoryNames
                      .slice(0, showFilters ? undefined : 8)
                      .map((category) => {
                        const isSelected =
                          selectedCategories.includes(category);
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
                          ? "Minder"
                          : `+${categoryNames.length - 8} meer`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Results count and sorting */}
          <div className="mx-auto px-4 py-4 md:px-12">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold text-foreground">
                  {availableCount}
                </span>{" "}
                beschikbare gebaren
                {selectedGestureIds.length > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-primary">
                      {selectedGestureIds.length} geselecteerd
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
                      <GestureCard
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

          {/* Floating selection bar */}
          <SelectionBar
            _total={pricing.totalCents}
            count={selectedGestureIds.length}
            onContinue={() => setCurrentStep("details")}
          />
        </>
      )}

      {/* Step 2: Details (combined configure + contact) */}
      {currentStep === "details" && (
        <div className="relative z-10 flex flex-1 flex-col bg-muted/20 px-4 lg:px-12">
          {/* Header */}
          <header className="sticky top-0 z-10 shrink-0 border-border border-b bg-background px-4 py-6">
            <div>
              <button
                className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setCurrentStep("select")}
                type="button"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                <span className="font-medium text-sm">Terug naar selectie</span>
              </button>

              {/* Progress indicator */}
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-semibold text-sm text-white">
                  2
                </div>
                <div className="h-1 w-12 rounded-full bg-primary/20">
                  <div className="h-full w-2/3 rounded-full bg-primary" />
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-border bg-background font-semibold text-muted-foreground text-sm">
                  3
                </div>
              </div>

              <h1 className="font-bold text-2xl">Configureer je sponsoring</h1>
              <p className="mt-2 text-muted-foreground">
                {selectedGestureIds.length}{" "}
                {selectedGestureIds.length === 1 ? "gebaar" : "gebaren"}{" "}
                geselecteerd
              </p>
            </div>
          </header>

          {/* Form content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24">
            <div className="mx-auto space-y-6">
              {/* Selected gestures */}
              <div className="space-y-2">
                <span className="font-semibold text-sm">
                  {t("web.sponsors.wizard.selectedGestures")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedGestures.map((gesture) => (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary text-sm"
                      key={gesture._id}
                    >
                      {gesture.name}
                      <button
                        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                        onClick={() => handleToggleSelection(gesture._id)}
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Sponsor Name */}
              <div className="space-y-2">
                <label className="font-semibold text-sm" htmlFor="sponsor-name">
                  {t("web.sponsors.wizard.sponsorNameLabel")}
                </label>
                <Input
                  className={`h-14 rounded-xl text-base ${errors.sponsorName ? "border-destructive" : ""}`}
                  id="sponsor-name"
                  maxLength={35}
                  onChange={(e) => {
                    setSponsorName(e.target.value);
                    setErrors((prev) => ({ ...prev, sponsorName: undefined }));
                  }}
                  placeholder={t("web.sponsors.wizard.sponsorNamePlaceholder")}
                  value={sponsorName}
                />
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-xs">
                    {sponsorName.length}/35
                  </p>
                  {errors.sponsorName && (
                    <p className="text-destructive text-xs">
                      {errors.sponsorName}
                    </p>
                  )}
                </div>
                <p className="rounded-xl bg-secondary/20 p-3 text-sm">
                  <span className="text-muted-foreground">Voorbeeld: </span>
                  <span className="font-medium">
                    "Met de warme steun van: {sponsorName || "..."}"
                  </span>
                </p>
              </div>

              {/* Logo option */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-4 transition-all hover:border-primary/50">
                  <input
                    checked={includeLogo}
                    className="mt-1 h-5 w-5 rounded accent-primary"
                    onChange={(e) => setIncludeLogo(e.target.checked)}
                    type="checkbox"
                  />
                  <div className="flex-1">
                    <span className="font-semibold">
                      {t("web.sponsors.wizard.includeLogo", {
                        price: formatPrice(LOGO_ADDON_CENTS),
                      })}
                    </span>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {t("web.sponsors.wizard.logoHelp")}
                    </p>
                  </div>
                </label>

                {includeLogo && (
                  <div className="space-y-2">
                    {logoPreview ? (
                      <div className="relative inline-block">
                        <img
                          alt="Logo preview"
                          className="h-24 w-24 rounded-xl border object-cover"
                          height={96}
                          src={logoPreview}
                          width={96}
                        />
                        <button
                          className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-white shadow-lg"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreview(null);
                          }}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label
                        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all hover:border-primary hover:bg-primary/5 ${
                          errors.logo ? "border-destructive" : "border-border"
                        }`}
                        htmlFor="logo-upload"
                      >
                        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                        <span className="text-center text-muted-foreground text-sm">
                          {t("web.sponsors.new.uploadLogo")}
                        </span>
                        <input
                          accept="image/png,image/jpeg,image/svg+xml"
                          className="hidden"
                          id="logo-upload"
                          onChange={handleLogoUpload}
                          type="file"
                        />
                      </label>
                    )}
                    {errors.logo && (
                      <p className="text-destructive text-xs">{errors.logo}</p>
                    )}

                    {/* Logo Guidelines */}
                    <div className="mt-3 space-y-2 rounded-xl bg-secondary/20 p-3">
                      <p className="font-semibold text-sm">
                        {t("web.sponsors.new.logoGuidelines.title")}
                      </p>
                      <ul className="space-y-1 text-muted-foreground text-xs">
                        <li>• {t("web.sponsors.new.logoGuidelines.format")}</li>
                        <li>
                          • {t("web.sponsors.new.logoGuidelines.dimensions")}
                        </li>
                        <li>
                          • {t("web.sponsors.new.logoGuidelines.aspectRatio")}
                        </li>
                        <li>
                          • {t("web.sponsors.new.logoGuidelines.fileSize")}
                        </li>
                        <li>• {t("web.sponsors.new.logoGuidelines.style")}</li>
                        <li>• {t("web.sponsors.new.logoGuidelines.avoid")}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-border border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-muted-foreground text-sm">
                    {t("web.sponsors.wizard.contactInfo")}
                  </span>
                </div>
              </div>

              {/* Contact: Full Name */}
              <div className="space-y-2">
                <label className="font-semibold text-sm" htmlFor="contact-name">
                  {t("web.sponsors.wizard.fullNameLabel")}
                </label>
                <Input
                  className={`h-14 rounded-xl text-base ${errors.contactFullName ? "border-destructive" : ""}`}
                  id="contact-name"
                  onChange={(e) => {
                    setContactFullName(e.target.value);
                    setErrors((prev) => ({
                      ...prev,
                      contactFullName: undefined,
                    }));
                  }}
                  placeholder={t("web.sponsors.wizard.fullNamePlaceholder")}
                  value={contactFullName}
                />
                {errors.contactFullName && (
                  <p className="text-destructive text-xs">
                    {errors.contactFullName}
                  </p>
                )}
              </div>

              {/* Contact: Email */}
              <div className="space-y-2">
                <label
                  className="font-semibold text-sm"
                  htmlFor="contact-email"
                >
                  {t("web.sponsors.wizard.emailLabel")}
                </label>
                <Input
                  className={`h-14 rounded-xl text-base ${errors.contactEmail ? "border-destructive" : ""}`}
                  id="contact-email"
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    setErrors((prev) => ({ ...prev, contactEmail: undefined }));
                  }}
                  placeholder={t("web.sponsors.wizard.emailPlaceholder")}
                  type="email"
                  value={contactEmail}
                />
                {errors.contactEmail && (
                  <p className="text-destructive text-xs">
                    {errors.contactEmail}
                  </p>
                )}
              </div>

              {/* Contact: Company (optional) */}
              <div className="space-y-2">
                <label
                  className="font-semibold text-sm"
                  htmlFor="contact-company"
                >
                  {t("web.sponsors.wizard.companyLabel")}{" "}
                  <span className="font-normal text-muted-foreground">
                    (optioneel)
                  </span>
                </label>
                <Input
                  className="h-14 rounded-xl text-base"
                  id="contact-company"
                  onChange={(e) => setContactCompany(e.target.value)}
                  placeholder={t("web.sponsors.wizard.companyPlaceholder")}
                  value={contactCompany}
                />
              </div>

              {/* Price summary */}
              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-3 font-semibold">
                  {t("web.sponsors.wizard.priceSummary")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.basePrice", {
                        count: selectedGestureIds.length,
                      })}
                    </span>
                    <span>
                      {formatPrice(
                        selectedGestureIds.length * PRICE_PER_YEAR_CENTS
                      )}
                    </span>
                  </div>
                  {includeLogo && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("web.sponsors.wizard.logoAddon")}
                      </span>
                      <span>{formatPrice(LOGO_ADDON_CENTS)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-primary/20 border-t pt-2 font-bold text-lg">
                    <span>{t("web.sponsors.wizard.total")}</span>
                    <span className="text-primary">
                      {formatPrice(pricing.totalCents)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Fixed at bottom */}
          <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background/95 px-4 py-4 shadow-lg backdrop-blur-md">
            <div className="mx-auto max-w-lg">
              <Button
                className="progress-button h-14 w-full rounded-xl font-semibold text-base"
                data-progress={isGeneratingPreview ? "true" : undefined}
                disabled={isGeneratingPreview}
                onClick={handleGeneratePreviewAndProceed}
                size="lg"
                style={
                  isGeneratingPreview
                    ? ({ "--progress": previewProgress } as React.CSSProperties)
                    : undefined
                }
              >
                {/* Progress fill overlay */}
                {isGeneratingPreview && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-white/20 transition-transform duration-300 ease-out"
                    style={{
                      transform: `translateX(${(previewProgress - 1) * 100}%)`,
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center">
                  {isGeneratingPreview ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("web.sponsors.wizard.generatingPreview")}
                      <span className="ml-2 tabular-nums">
                        {Math.round(previewProgress * 100)}%
                      </span>
                    </>
                  ) : (
                    <>
                      {t("web.sponsors.wizard.generatePreview")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Step 3: Preview & Pay (combined preview + summary) */}
      {currentStep === "preview" && previewPlaybackId && (
        <div className="relative z-10 flex flex-1 flex-col bg-muted/20 px-4 lg:px-12">
          {/* Header */}
          <header className="sticky top-0 z-10 shrink-0 border-border border-b bg-background px-4 py-6">
            <div>
              <button
                className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setCurrentStep("details")}
                type="button"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                <span className="font-medium text-sm">Terug naar details</span>
              </button>

              {/* Progress indicator */}
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 font-semibold text-primary text-sm">
                  <Check className="h-4 w-4" />
                </div>
                <div className="h-1 w-12 rounded-full bg-primary" />
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 font-semibold text-primary text-sm">
                  <Check className="h-4 w-4" />
                </div>
                <div className="h-1 w-12 rounded-full bg-primary" />
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-semibold text-sm text-white">
                  3
                </div>
              </div>

              <h1 className="font-bold text-2xl">Bekijk je preview</h1>
              <p className="mt-2 text-muted-foreground">
                Laatste stap voordat je naar de betaling gaat
              </p>
            </div>
          </header>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24">
            <div className="mx-auto max-w-md space-y-6">
              {/* Video Player */}
              <div className="overflow-hidden rounded-2xl border-2 border-border shadow-xl">
                <MuxPlayer
                  accentColor="#00805f"
                  playbackId={previewPlaybackId}
                  streamType="on-demand"
                  style={{ width: "100%", aspectRatio: "810/1080" }}
                />
              </div>

              {/* Summary card */}
              <div className="space-y-4 rounded-2xl border-2 border-primary/20 bg-card p-5">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">
                    {t("web.sponsors.wizard.sponsorshipDetails")}
                  </h3>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gebaren</span>
                    <span className="font-medium">
                      {selectedGestureIds.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.duration")}
                    </span>
                    <span className="font-medium">
                      {t("web.sponsors.wizard.durationValue")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Naam in video</span>
                    <span className="font-medium">{sponsorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Logo</span>
                    <span className="font-medium">
                      {includeLogo ? "Ja" : "Nee"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact</span>
                    <span className="truncate font-medium">{contactEmail}</span>
                  </div>
                </div>

                <div className="border-primary/20 border-t pt-4">
                  <div className="flex justify-between font-bold text-xl">
                    <span>{t("web.sponsors.wizard.totalAmount")}</span>
                    <span className="text-primary">
                      {formatPrice(pricing.totalCents)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Fixed at bottom */}
          <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background/95 px-4 py-4 pb-safe-bottom shadow-lg backdrop-blur-md">
            <div className="mx-auto max-w-lg">
              <Button
                className="progress-button h-14 w-full rounded-xl font-semibold text-base"
                data-progress={isProcessing ? "true" : undefined}
                disabled={isProcessing}
                onClick={handleProceedToPayment}
                size="lg"
                style={
                  isProcessing
                    ? ({ "--progress": paymentProgress } as React.CSSProperties)
                    : undefined
                }
              >
                {/* Progress fill overlay */}
                {isProcessing && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-white/20 transition-transform duration-300 ease-out"
                    style={{
                      transform: `translateX(${(paymentProgress - 1) * 100}%)`,
                    }}
                  />
                )}
                <span className="relative z-10 flex items-center">
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("web.sponsors.wizard.processing")}
                      <span className="ml-2 tabular-nums">
                        {Math.round(paymentProgress * 100)}%
                      </span>
                    </>
                  ) : (
                    <>
                      <Heart className="mr-2 h-5 w-5" />
                      {t("web.sponsors.wizard.proceedToPayment")}
                    </>
                  )}
                </span>
              </Button>
              <p className="text-center text-muted-foreground text-xs">
                {t("web.sponsors.wizard.redirectMessage")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
