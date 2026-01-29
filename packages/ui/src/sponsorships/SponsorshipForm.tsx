import { Upload, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { GestureWithSponsorshipStatus } from "./SponsorshipList";

interface SponsorshipFormProps {
  selectedGestures: GestureWithSponsorshipStatus[];
  sponsorName: string;
  onSponsorNameChange: (name: string) => void;
  includeLogo: boolean;
  onIncludeLogoChange: (include: boolean) => void;
  logoFile: File | null;
  onLogoFileChange: (file: File | null) => void;
  onRemoveGesture: (gestureId: string) => void;
  onProceedToPayment: () => void;
  pricePerGesture: number;
  logoAddon: number;
  total: number;
  isProcessing?: boolean;
  errors?: {
    sponsorName?: string;
    logo?: string;
  };
}

export function SponsorshipForm({
  selectedGestures,
  sponsorName,
  onSponsorNameChange,
  includeLogo,
  onIncludeLogoChange,
  logoFile,
  onLogoFileChange,
  onRemoveGesture,
  onProceedToPayment,
  pricePerGesture,
  logoAddon,
  total,
  isProcessing = false,
  errors = {},
}: SponsorshipFormProps) {
  const { t } = useTranslation();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        return;
      }

      onLogoFileChange(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    onLogoFileChange(null);
    setLogoPreview(null);
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  const canProceed =
    selectedGestures.length > 0 &&
    sponsorName.trim().length > 0 &&
    sponsorName.length <= 10 &&
    (!includeLogo || logoFile !== null);

  return (
    <div className="flex h-full flex-col overflow-hidden border-border border-l bg-card">
      {/* Header */}
      <div className="shrink-0 border-border border-b px-6 py-4">
        <h2 className="font-semibold text-lg">
          {t("web.sponsors.new.selectGestures")}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t("web.sponsors.new.subtitle")}
        </p>
      </div>

      {/* Form content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {/* Selected gestures */}
        {selectedGestures.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 font-medium text-sm">
              {t("web.sponsors.new.selectedGestures", {
                count: selectedGestures.length,
              })}
            </h3>
            <div className="space-y-2">
              {selectedGestures.map((gesture) => (
                <div
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                  key={gesture._id}
                >
                  <span className="text-sm">{gesture.name}</span>
                  <button
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onRemoveGesture(gesture._id)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedGestures.length === 0 && (
          <div className="mb-6 rounded-md border border-border bg-muted/30 p-4 text-center">
            <p className="text-muted-foreground text-sm">
              {t("web.sponsors.new.validation.selectGesture")}
            </p>
          </div>
        )}

        {/* Sponsor name */}
        <div className="mb-6">
          <label
            className="mb-2 block font-medium text-sm"
            htmlFor="sponsor-name"
          >
            {t("web.sponsors.new.sponsorName")}
          </label>
          <input
            className={`w-full rounded-md border ${
              errors.sponsorName ? "border-red-500" : "border-border"
            } bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary`}
            id="sponsor-name"
            maxLength={10}
            onChange={(e) => onSponsorNameChange(e.target.value)}
            placeholder={t("web.sponsors.new.sponsorNamePlaceholder")}
            type="text"
            value={sponsorName}
          />
          <p className="mt-1 text-muted-foreground text-xs">
            {sponsorName.length}/10 characters
          </p>
          {errors.sponsorName && (
            <p className="mt-1 text-red-500 text-xs">{errors.sponsorName}</p>
          )}
          <p className="mt-2 text-muted-foreground text-xs">
            {t("web.sponsors.new.sponsorNameHelp", {
              name: sponsorName || "...",
            })}
          </p>
        </div>

        {/* Include logo */}
        <div className="mb-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              checked={includeLogo}
              className="mt-0.5"
              onChange={(e) => onIncludeLogoChange(e.target.checked)}
              type="checkbox"
            />
            <div>
              <span className="font-medium text-sm">
                {t("web.sponsors.new.includeLogo")}
              </span>
              <p className="mt-1 text-muted-foreground text-xs">
                {t("web.sponsors.new.logoHelp")}
              </p>
            </div>
          </label>
        </div>

        {/* Logo upload */}
        {includeLogo && (
          <div className="mb-6">
            {logoPreview ? (
              <div className="relative inline-block">
                <img
                  alt="Logo preview"
                  className="h-32 w-32 rounded-md border border-border object-cover"
                  height={128}
                  src={logoPreview}
                  width={128}
                />
                <button
                  className="absolute top-2 right-2 rounded-full bg-background p-1 shadow-md hover:bg-muted"
                  onClick={handleRemoveLogo}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed ${
                  errors.logo ? "border-red-500" : "border-border"
                } bg-muted/30 p-6 hover:bg-muted/50`}
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
              <p className="mt-1 text-red-500 text-xs">{errors.logo}</p>
            )}
          </div>
        )}

        {/* Duration */}
        <div className="mb-6">
          <h3 className="mb-2 font-medium text-sm">
            {t("web.sponsors.new.duration")}
          </h3>
          <div className="rounded-md border border-border bg-background px-3 py-2">
            <span className="text-sm">
              {t("web.sponsors.new.fixedDuration")}
            </span>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <h3 className="mb-3 font-medium text-sm">
            {t("web.sponsors.new.pricing.total")}
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {selectedGestures.length} ×{" "}
                {formatPrice(
                  includeLogo ? pricePerGesture : pricePerGesture - logoAddon
                )}
              </span>
              <span className="font-medium">
                {formatPrice(
                  pricePerGesture * selectedGestures.length -
                    (includeLogo ? 0 : logoAddon * selectedGestures.length)
                )}
              </span>
            </div>
            {includeLogo && logoAddon > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("web.sponsors.new.pricing.logoAddon", {
                    count: selectedGestures.length,
                  })}
                </span>
                <span className="font-medium">
                  {formatPrice(logoAddon * selectedGestures.length)}
                </span>
              </div>
            )}
            <div className="border-border border-t pt-2">
              <div className="flex justify-between">
                <span className="font-semibold">
                  {t("web.sponsors.new.pricing.total")}
                </span>
                <span className="font-semibold text-lg">
                  {formatPrice(total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-border border-t px-6 py-4">
        <button
          className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canProceed || isProcessing}
          onClick={onProceedToPayment}
          type="button"
        >
          {isProcessing
            ? t("web.sponsors.create.processing")
            : t("web.sponsors.new.proceedToPayment")}
        </button>
      </div>
    </div>
  );
}
