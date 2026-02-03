import MuxPlayer from "@mux/mux-player-react";
import { api } from "@smog/convex";
import { useGestureFiltering } from "@smog/hooks";
import type { GestureWithSponsorshipStatus } from "@smog/ui";
import { SponsorshipFilters, SponsorshipList } from "@smog/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateSimplifiedPrice,
  formatPrice,
  LOGO_ADDON_CENTS,
  PRICE_PER_YEAR_CENTS,
} from "@/lib/pricing";
import { client, orpc } from "@/utils/orpc";

type WizardStep = "select" | "configure" | "preview" | "contact" | "summary";

interface SearchParams {
  gestureId?: string;
}

export const Route = createFileRoute("/sponsors/")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    gestureId: (search.gestureId as string) || undefined,
  }),
  component: SponsorsComponent,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-step wizard requires complex state management
function SponsorsComponent() {
  const { t } = useTranslation();
  const searchParams = Route.useSearch();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>("select");

  // Form state
  const [selectedGestureIds, setSelectedGestureIds] = useState<string[]>([]);
  const [sponsorName, setSponsorName] = useState("");
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [contactFullName, setContactFullName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(
    null
  );
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<{
    sponsorName?: string;
    logo?: string;
    contactFullName?: string;
    contactEmail?: string;
  }>({});

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

  // Transform to the format expected by SponsorshipList
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

  // Remove gesture from selection
  const handleRemoveGesture = useCallback((gestureId: string) => {
    setSelectedGestureIds((prev) => prev.filter((id) => id !== gestureId));
  }, []);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    for (const cat of selectedCategories) {
      handleCategoryToggle(cat);
    }
  }, [setSearchQuery, selectedCategories, handleCategoryToggle]);

  // Generate preview video
  const handleGeneratePreview = async () => {
    // Validate
    const newErrors: typeof errors = {};

    if (!sponsorName.trim()) {
      newErrors.sponsorName = t(
        "web.sponsors.new.validation.sponsorNameRequired"
      );
    } else if (sponsorName.length > 10) {
      newErrors.sponsorName = t(
        "web.sponsors.new.validation.sponsorNameTooLong"
      );
    }

    // Logo is only required if includeLogo is true
    if (includeLogo && !logoFile) {
      newErrors.logo = t("web.sponsors.new.validation.logoRequired");
    }

    // Validate file size if logo is provided
    if (logoFile && logoFile.size > 2 * 1024 * 1024) {
      newErrors.logo = t("web.sponsors.new.validation.logoTooLarge");
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    setIsGeneratingPreview(true);

    try {
      // Convert logo to base64 if present and includeLogo is true
      let logoBase64: string | undefined;
      if (includeLogo && logoFile) {
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });
      }

      // Generate preview for first gesture
      const firstGesture = selectedGestures[0];
      if (!firstGesture) {
        throw new Error("No gesture selected");
      }

      console.log("[Sponsors] Generating preview for:", firstGesture.name);
      const result = await client.sponsorships.generatePreview({
        gestureId: firstGesture._id,
        sponsorName,
        logoImage: logoBase64, // Will be undefined if no logo
        overlayText: `Met de warme steun van:\n${sponsorName}`,
      });

      console.log("[Sponsors] Preview generated:", result.playbackId);
      setPreviewPlaybackId(result.playbackId);
      setCurrentStep("preview");
    } catch (error) {
      console.error("[Sponsors] Failed to generate preview:", error);
      toast.error(t("web.sponsors.wizard.errors.previewFailed"));
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Handle final submission
  const handleProceedToPayment = async () => {
    setIsProcessing(true);

    try {
      // Convert logo to base64 if present and includeLogo is true
      let logoBase64: string | undefined;
      if (includeLogo && logoFile) {
        logoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(logoFile);
        });
      }

      // Create sponsorships
      const result = await client.sponsorships.createBulkSponsorshipsSimplified(
        {
          gestureIds: selectedGestureIds,
          sponsorName,
          sponsorEmail: contactEmail,
          contactFullName,
          contactCompany: contactCompany || undefined,
          overlayText: `Met de warme steun van:\n${sponsorName}`,
          logoImage: logoBase64, // Will be undefined if no logo
          includeLogo,
          durationYears: 1,
          previewVideoPlaybackId: previewPlaybackId || "",
        }
      );

      // Create payment
      const payment = await client.sponsorships.createBulkPayment({
        sponsorshipIds: result.sponsorshipIds,
        amount: pricing.totalCents,
      });

      // Redirect to Mollie
      window.location.href = payment.checkoutUrl;
    } catch (error) {
      console.error("Failed to create sponsorships:", error);
      toast.error(t("web.sponsors.wizard.errors.paymentFailed"));
      setIsProcessing(false);
    }
  };

  // Validate contact form
  const validateContact = (): boolean => {
    const newErrors: typeof errors = {};

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

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="shrink-0 border-border border-b bg-background px-6 py-4">
        <h1 className="font-bold text-2xl">{t("web.sponsors.new.title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("web.sponsors.new.subtitle")}
        </p>

        {/* Step indicator */}
        {currentStep !== "select" && (
          <div className="mt-4 flex items-center gap-2">
            <Button
              onClick={() => {
                if (currentStep === "configure") {
                  setCurrentStep("select");
                } else if (currentStep === "preview") {
                  setCurrentStep("configure");
                } else if (currentStep === "contact") {
                  setCurrentStep("preview");
                } else if (currentStep === "summary") {
                  setCurrentStep("contact");
                }
              }}
              size="sm"
              variant="ghost"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("web.sponsors.wizard.back")}
            </Button>
            <div className="flex-1 text-muted-foreground text-sm">
              {t("web.sponsors.wizard.step", {
                current:
                  currentStep === "configure"
                    ? "2"
                    : currentStep === "preview"
                      ? "3"
                      : currentStep === "contact"
                        ? "4"
                        : "5",
                total: "5",
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Step 1: Select Gestures */}
        {currentStep === "select" && (
          <>
            {/* Left panel - Gesture list */}
            <div className="flex min-w-0 flex-1 flex-col md:w-2/3">
              <SponsorshipFilters
                allCategories={categoryNames}
                onCategoryToggle={handleCategoryToggle}
                onClearFilters={
                  selectedCategories.length > 0 ? handleClearFilters : undefined
                }
                onSearchChange={setSearchQuery}
                searchQuery={searchQuery}
                selectedCategories={selectedCategories}
              />
              <SponsorshipList
                error={error as Error | null}
                gestures={
                  filteredGestures as unknown as GestureWithSponsorshipStatus[]
                }
                isLoading={isLoading}
                onToggleSelection={handleToggleSelection}
                selectedGestureIds={selectedGestureIds}
              />
            </div>

            {/* Right panel - Continue button */}
            <div
              className={`${
                selectedGestureIds.length === 0 ? "hidden md:flex" : "flex"
              } w-full flex-col border-border border-l bg-muted/20 p-6 md:w-1/3`}
            >
              <div className="space-y-4">
                <h2 className="font-semibold text-xl">
                  {t("web.sponsors.wizard.selectedGestures")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("web.sponsors.wizard.gesturesSelected", {
                    count: selectedGestureIds.length,
                    plural: selectedGestureIds.length !== 1 ? "s" : "",
                  })}
                </p>

                <div className="space-y-2">
                  {selectedGestures.map((gesture) => (
                    <div
                      className="flex items-center justify-between rounded-md border bg-background p-3"
                      key={gesture._id}
                    >
                      <span className="font-medium text-sm">
                        {gesture.name}
                      </span>
                      <Button
                        onClick={() => handleRemoveGesture(gesture._id)}
                        size="sm"
                        variant="ghost"
                      >
                        {t("web.sponsors.wizard.remove")}
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  disabled={selectedGestureIds.length === 0}
                  onClick={() => setCurrentStep("configure")}
                  size="lg"
                >
                  {t("web.sponsors.wizard.continue")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Configure Details */}
        {currentStep === "configure" && (
          <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-6">
            <div>
              <h2 className="mb-2 font-semibold text-xl">
                {t("web.sponsors.wizard.configureTitle")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.configureSubtitle", {
                  count: selectedGestureIds.length,
                  message: `Met de warme steun van: ${sponsorName || "[Your Name]"}`,
                })}
              </p>
            </div>

            {/* Sponsor Name */}
            <div className="space-y-2">
              <Label htmlFor="sponsor-name">
                {t("web.sponsors.wizard.sponsorNameLabel")}
              </Label>
              <Input
                id="sponsor-name"
                maxLength={10}
                onChange={(e) => setSponsorName(e.target.value)}
                placeholder={t("web.sponsors.wizard.sponsorNamePlaceholder")}
                value={sponsorName}
              />
              {errors.sponsorName && (
                <p className="text-destructive text-sm">{errors.sponsorName}</p>
              )}
              <p className="text-muted-foreground text-xs">
                {t("web.sponsors.wizard.maxCharacters", {
                  current: sponsorName.length,
                })}
              </p>
            </div>

            {/* Logo Upload */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  checked={includeLogo}
                  id="include-logo"
                  onChange={(e) => setIncludeLogo(e.target.checked)}
                  type="checkbox"
                />
                <Label htmlFor="include-logo">
                  {t("web.sponsors.wizard.includeLogo", {
                    price: formatPrice(LOGO_ADDON_CENTS),
                  })}
                </Label>
              </div>

              {includeLogo && (
                <div className="space-y-2">
                  <Input
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    type="file"
                  />
                  {errors.logo && (
                    <p className="text-destructive text-sm">{errors.logo}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {t("web.sponsors.wizard.logoHelp")}
                  </p>
                </div>
              )}
            </div>

            {/* Price Summary */}
            <div className="rounded-lg border bg-muted p-4">
              <h3 className="mb-3 font-semibold">
                {t("web.sponsors.wizard.priceSummary")}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.wizard.basePrice", {
                      count: selectedGestureIds.length,
                      plural: selectedGestureIds.length !== 1 ? "s" : "",
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
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>{t("web.sponsors.wizard.total")}</span>
                  <span>{formatPrice(pricing.totalCents)}</span>
                </div>
              </div>
            </div>

            {/* Generate Preview Button */}
            <Button
              className="w-full"
              disabled={
                !sponsorName.trim() ||
                (includeLogo && !logoFile) ||
                isGeneratingPreview
              }
              onClick={handleGeneratePreview}
              size="lg"
            >
              {isGeneratingPreview ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("web.sponsors.wizard.generatingPreview")}
                </>
              ) : (
                <>
                  {t("web.sponsors.wizard.generatePreview")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 3: Preview Video */}
        {currentStep === "preview" && previewPlaybackId && (
          <div className="mx-auto w-full max-w-3xl space-y-6 overflow-y-auto p-6">
            <div>
              <h2 className="mb-2 font-semibold text-xl">
                {t("web.sponsors.wizard.previewTitle")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.previewSubtitle", {
                  count: selectedGestureIds.length,
                })}
              </p>
            </div>

            {/* Video Player */}
            <div className="overflow-hidden rounded-lg border">
              <MuxPlayer
                accentColor="#10b981"
                playbackId={previewPlaybackId}
                streamType="on-demand"
                style={{ width: "100%", aspectRatio: "16/9" }}
              />
            </div>

            {/* Summary */}
            <div className="rounded-lg border bg-muted p-4">
              <h3 className="mb-3 font-semibold">
                {t("web.sponsors.wizard.sponsorshipDetails")}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.new.success.gestures")}
                  </span>
                  <span>{selectedGestureIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.wizard.duration")}
                  </span>
                  <span>{t("web.sponsors.wizard.durationValue")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.new.sponsorName")}
                  </span>
                  <span>{sponsorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.wizard.logo")}
                  </span>
                  <span>
                    {includeLogo
                      ? t("web.sponsors.wizard.yes")
                      : t("web.sponsors.wizard.no")}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>{t("web.sponsors.wizard.total")}</span>
                  <span>{formatPrice(pricing.totalCents)}</span>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => setCurrentStep("contact")}
              size="lg"
            >
              {t("web.sponsors.wizard.continueToContact")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 4: Contact Information */}
        {currentStep === "contact" && (
          <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-6">
            <div>
              <h2 className="mb-2 font-semibold text-xl">
                {t("web.sponsors.wizard.contactTitle")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.contactSubtitle")}
              </p>
            </div>

            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="contact-name">
                  {t("web.sponsors.wizard.fullNameLabel")}
                </Label>
                <Input
                  id="contact-name"
                  onChange={(e) => setContactFullName(e.target.value)}
                  placeholder={t("web.sponsors.wizard.fullNamePlaceholder")}
                  value={contactFullName}
                />
                {errors.contactFullName && (
                  <p className="text-destructive text-sm">
                    {errors.contactFullName}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="contact-email">
                  {t("web.sponsors.wizard.emailLabel")}
                </Label>
                <Input
                  id="contact-email"
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t("web.sponsors.wizard.emailPlaceholder")}
                  type="email"
                  value={contactEmail}
                />
                {errors.contactEmail && (
                  <p className="text-destructive text-sm">
                    {errors.contactEmail}
                  </p>
                )}
              </div>

              {/* Company (optional) */}
              <div className="space-y-2">
                <Label htmlFor="contact-company">
                  {t("web.sponsors.wizard.companyLabel")}
                </Label>
                <Input
                  id="contact-company"
                  onChange={(e) => setContactCompany(e.target.value)}
                  placeholder={t("web.sponsors.wizard.companyPlaceholder")}
                  value={contactCompany}
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                if (validateContact()) {
                  setCurrentStep("summary");
                }
              }}
              size="lg"
            >
              {t("web.sponsors.wizard.continueToSummary")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Step 5: Payment Summary */}
        {currentStep === "summary" && (
          <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-6">
            <div>
              <h2 className="mb-2 font-semibold text-xl">
                {t("web.sponsors.wizard.reviewTitle")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("web.sponsors.wizard.reviewSubtitle")}
              </p>
            </div>

            {/* Full Summary */}
            <div className="space-y-4 rounded-lg border p-6">
              <div>
                <h3 className="mb-3 font-semibold">
                  {t("web.sponsors.wizard.sponsorshipDetails")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.new.success.gestures")}
                    </span>
                    <span>
                      {selectedGestureIds.length}{" "}
                      {t("web.sponsors.wizard.gesture")}
                      {selectedGestureIds.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.duration")}
                    </span>
                    <span>{t("web.sponsors.wizard.durationValue")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.new.sponsorName")}
                    </span>
                    <span>{sponsorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.logo")}
                    </span>
                    <span>
                      {includeLogo
                        ? t("web.sponsors.wizard.yes")
                        : t("web.sponsors.wizard.no")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3 font-semibold">
                  {t("web.sponsors.wizard.contactInfo")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.name")}
                    </span>
                    <span>{contactFullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("web.sponsors.wizard.email")}
                    </span>
                    <span>{contactEmail}</span>
                  </div>
                  {contactCompany && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("web.sponsors.wizard.company")}
                      </span>
                      <span>{contactCompany}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between font-semibold text-lg">
                  <span>{t("web.sponsors.wizard.totalAmount")}</span>
                  <span>{formatPrice(pricing.totalCents)}</span>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={isProcessing}
              onClick={handleProceedToPayment}
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("web.sponsors.wizard.processing")}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {t("web.sponsors.wizard.proceedToPayment")}
                </>
              )}
            </Button>

            <p className="text-center text-muted-foreground text-xs">
              {t("web.sponsors.wizard.redirectMessage")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
