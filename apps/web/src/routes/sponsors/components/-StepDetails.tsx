/**
 * @fileoverview Step 2 of the sponsorship wizard — sponsor details & contact form.
 *
 * Renders the combined "configure + contact" form: sponsor name, logo upload,
 * contact info, invoice request, and price summary. All state flows through
 * the `useSponsorshipForm` hook.
 */

import { ArrowRight, Loader2, Upload, X } from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatPrice,
  LOGO_ADDON_CENTS,
  PRICE_PER_YEAR_CENTS,
} from "@/lib/pricing";
import type { SponsorshipFormState } from "../hooks/-useSponsorshipForm";

interface SelectedGestureChipProps {
  gesture: { _id: string; name: string };
  onRemove: (gestureId: string) => void;
}

function SelectedGestureChip({ gesture, onRemove }: SelectedGestureChipProps) {
  const { t } = useTranslation();

  const handleRemove = useCallback((): void => {
    onRemove(gesture._id);
  }, [onRemove, gesture._id]);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary text-sm">
      {gesture.name}
      <button
        aria-label={t("web.sponsors.wizard.removeGestureLabel", {
          name: gesture.name,
        })}
        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
        onClick={handleRemove}
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface StepDetailsProps {
  form: SponsorshipFormState;
  onGeneratePreview: () => Promise<void>;
  selectedGestures: Array<{ _id: string; name: string }>;
}

/**
 * Sponsor details + contact information step of the wizard.
 *
 * Shows:
 * - Selected gestures list with individual removal buttons
 * - Sponsor name input (max 35 chars)
 * - Logo toggle and file upload
 * - Contact full name, email, company
 * - Optional invoice fields (name, VAT, email)
 * - Price summary
 * - "Generate preview" CTA with progress animation
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-step form requires handling many conditional fields
export function StepDetails({
  form,
  selectedGestures,
  onGeneratePreview,
}: StepDetailsProps) {
  const { i18n, t } = useTranslation();

  const {
    contactEmail,
    invoiceEmail,
    setContactCompany,
    setContactEmail,
    setContactFullName,
    setCurrentStep,
    setErrors,
    setIncludeLogo,
    setInvoiceEmail,
    setInvoiceName,
    setInvoiceRequested,
    setInvoiceVatNumber,
    setLogoFile,
    setLogoPreview,
    setSponsorName,
  } = form;

  const handleLogoUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
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
      reader.onload = (e) => setLogoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    },
    [setErrors, setLogoFile, setLogoPreview, t]
  );

  const handleBackToSelection = useCallback((): void => {
    setCurrentStep("select");
  }, [setCurrentStep]);

  const handleSponsorNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setSponsorName(e.target.value);
      setErrors((prev) => ({ ...prev, sponsorName: undefined }));
    },
    [setSponsorName, setErrors]
  );

  const handleIncludeLogoChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setIncludeLogo(e.target.checked);
    },
    [setIncludeLogo]
  );

  const handleRemoveLogo = useCallback((): void => {
    setLogoFile(null);
    setLogoPreview(null);
  }, [setLogoFile, setLogoPreview]);

  const handleContactFullNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setContactFullName(e.target.value);
      setErrors((prev) => ({
        ...prev,
        contactFullName: undefined,
      }));
    },
    [setContactFullName, setErrors]
  );

  const handleContactEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setContactEmail(e.target.value);
      setErrors((prev) => ({
        ...prev,
        contactEmail: undefined,
      }));
    },
    [setContactEmail, setErrors]
  );

  const handleContactCompanyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setContactCompany(e.target.value);
    },
    [setContactCompany]
  );

  const handleInvoiceRequestedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setInvoiceRequested(e.target.checked);
      if (e.target.checked && !invoiceEmail) {
        setInvoiceEmail(contactEmail);
      }
    },
    [setInvoiceRequested, invoiceEmail, setInvoiceEmail, contactEmail]
  );

  const handleInvoiceNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setInvoiceName(e.target.value);
      setErrors((prev) => ({
        ...prev,
        invoiceName: undefined,
      }));
    },
    [setInvoiceName, setErrors]
  );

  const handleInvoiceVatNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setInvoiceVatNumber(e.target.value);
      setErrors((prev) => ({
        ...prev,
        invoiceVatNumber: undefined,
      }));
    },
    [setInvoiceVatNumber, setErrors]
  );

  const handleInvoiceEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      setInvoiceEmail(e.target.value);
      setErrors((prev) => ({
        ...prev,
        invoiceEmail: undefined,
      }));
    },
    [setInvoiceEmail, setErrors]
  );

  return (
    <div className="relative z-10 flex flex-1 flex-col bg-muted/20 px-4 lg:px-12">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 shrink-0 border-border border-b bg-background px-4 py-6">
        <button
          className="mb-4 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleBackToSelection}
          type="button"
        >
          <ArrowRight className="h-4 w-4 rotate-180" />
          <span className="font-medium text-sm">
            {t("web.sponsors.wizard.backToSelection")}
          </span>
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

        <h1 className="font-bold text-2xl">
          {t("web.sponsors.wizard.configureTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("web.sponsors.wizard.gesturesSelected", {
            count: form.selectedGestureIds.length,
          })}
        </p>
      </header>

      {/* Scrollable form */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="mx-auto space-y-6">
          {/* Selected gestures */}
          <div className="space-y-2">
            <span className="font-semibold text-sm">
              {t("web.sponsors.wizard.selectedGestures")}
            </span>
            <div className="flex flex-wrap gap-2">
              {selectedGestures.map((gesture) => (
                <SelectedGestureChip
                  gesture={gesture}
                  key={gesture._id}
                  onRemove={form.handleToggleSelection}
                />
              ))}
            </div>
          </div>

          {/* Sponsor Name */}
          <div className="space-y-2">
            <label className="font-semibold text-sm" htmlFor="sponsor-name">
              {t("web.sponsors.wizard.sponsorNameLabel")}
            </label>
            <Input
              className={`h-14 rounded-xl text-base ${form.errors.sponsorName ? "border-destructive" : ""}`}
              id="sponsor-name"
              maxLength={35}
              onChange={handleSponsorNameChange}
              placeholder={t("web.sponsors.wizard.sponsorNamePlaceholder")}
              value={form.sponsorName}
            />
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs">
                {form.sponsorName.length}/35
              </p>
              {form.errors.sponsorName ? (
                <p className="text-destructive text-xs">
                  {form.errors.sponsorName}
                </p>
              ) : null}
            </div>
            <p className="rounded-xl bg-secondary/20 p-3 text-sm">
              <span className="text-muted-foreground">
                {t("web.sponsors.wizard.example")}:{" "}
              </span>
              <span className="font-medium">
                "Met de warme steun van: {form.sponsorName || "..."}"
              </span>
            </p>
          </div>

          {/* Logo option */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-4 transition-all hover:border-primary/50">
              <input
                checked={form.includeLogo}
                className="mt-1 h-5 w-5 rounded accent-primary"
                onChange={handleIncludeLogoChange}
                type="checkbox"
              />
              <div className="flex-1">
                <span className="font-semibold">
                  {t("web.sponsors.wizard.includeLogo", {
                    price: formatPrice(
                      LOGO_ADDON_CENTS,
                      i18n.resolvedLanguage ?? i18n.language
                    ),
                  })}
                </span>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t("web.sponsors.wizard.logoHelp")}
                </p>
              </div>
            </label>

            {form.includeLogo ? (
              <div className="space-y-2">
                {form.logoPreview ? (
                  <div className="relative inline-block">
                    <img
                      alt={t("web.sponsors.wizard.logoPreviewAlt")}
                      className="h-24 w-24 rounded-xl border object-cover"
                      height={96}
                      src={form.logoPreview}
                      width={96}
                    />
                    <button
                      aria-label={t("web.sponsors.wizard.removeLogo")}
                      className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-white shadow-lg"
                      onClick={handleRemoveLogo}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all hover:border-primary hover:bg-primary/5 ${
                      form.errors.logo ? "border-destructive" : "border-border"
                    }`}
                    htmlFor="logo-upload"
                  >
                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                    <span className="text-center text-muted-foreground text-sm">
                      {t("web.sponsors.new.uploadLogo")}
                    </span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      id="logo-upload"
                      onChange={handleLogoUpload}
                      type="file"
                    />
                  </label>
                )}
                {form.errors.logo ? (
                  <p className="text-destructive text-xs">{form.errors.logo}</p>
                ) : null}
                <div className="mt-3 space-y-2 rounded-xl bg-secondary/20 p-3">
                  <p className="font-semibold text-sm">
                    {t("web.sponsors.new.logoGuidelines.title")}
                  </p>
                  <ul className="space-y-1 text-muted-foreground text-xs">
                    <li>• {t("web.sponsors.new.logoGuidelines.format")}</li>
                    <li>• {t("web.sponsors.new.logoGuidelines.dimensions")}</li>
                    <li>
                      • {t("web.sponsors.new.logoGuidelines.aspectRatio")}
                    </li>
                    <li>• {t("web.sponsors.new.logoGuidelines.fileSize")}</li>
                    <li>• {t("web.sponsors.new.logoGuidelines.style")}</li>
                    <li>• {t("web.sponsors.new.logoGuidelines.avoid")}</li>
                  </ul>
                </div>
              </div>
            ) : null}
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
              className={`h-14 rounded-xl text-base ${form.errors.contactFullName ? "border-destructive" : ""}`}
              id="contact-name"
              onChange={handleContactFullNameChange}
              placeholder={t("web.sponsors.wizard.fullNamePlaceholder")}
              value={form.contactFullName}
            />
            {form.errors.contactFullName ? (
              <p className="text-destructive text-xs">
                {form.errors.contactFullName}
              </p>
            ) : null}
          </div>

          {/* Contact: Email */}
          <div className="space-y-2">
            <label className="font-semibold text-sm" htmlFor="contact-email">
              {t("web.sponsors.wizard.emailLabel")}
            </label>
            <Input
              className={`h-14 rounded-xl text-base ${form.errors.contactEmail ? "border-destructive" : ""}`}
              id="contact-email"
              onChange={handleContactEmailChange}
              placeholder={t("web.sponsors.wizard.emailPlaceholder")}
              type="email"
              value={form.contactEmail}
            />
            {form.errors.contactEmail ? (
              <p className="text-destructive text-xs">
                {form.errors.contactEmail}
              </p>
            ) : null}
          </div>

          {/* Contact: Company (optional) */}
          <div className="space-y-2">
            <label className="font-semibold text-sm" htmlFor="contact-company">
              {t("web.sponsors.wizard.companyLabel")}{" "}
              <span className="font-normal text-muted-foreground">
                ({t("web.sponsors.wizard.optional")})
              </span>
            </label>
            <Input
              className="h-14 rounded-xl text-base"
              id="contact-company"
              onChange={handleContactCompanyChange}
              placeholder={t("web.sponsors.wizard.companyPlaceholder")}
              value={form.contactCompany}
            />
          </div>

          {/* Invoice request */}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card p-4 transition-all hover:border-primary/50">
              <input
                checked={form.invoiceRequested}
                className="mt-1 h-5 w-5 rounded accent-primary"
                onChange={handleInvoiceRequestedChange}
                type="checkbox"
              />
              <div className="flex-1">
                <span className="font-semibold">
                  {t("web.sponsors.wizard.invoiceCheckbox")}
                </span>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t("web.sponsors.wizard.invoiceSection")}
                </p>
              </div>
            </label>

            {form.invoiceRequested ? (
              <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
                {/* Invoice: Name */}
                <div className="space-y-2">
                  <label
                    className="font-semibold text-sm"
                    htmlFor="invoice-name"
                  >
                    {t("web.sponsors.wizard.invoiceNameLabel")} *
                  </label>
                  <Input
                    className={`h-14 rounded-xl text-base ${form.errors.invoiceName ? "border-destructive" : ""}`}
                    id="invoice-name"
                    onChange={handleInvoiceNameChange}
                    placeholder={t(
                      "web.sponsors.wizard.invoiceNamePlaceholder"
                    )}
                    value={form.invoiceName}
                  />
                  {form.errors.invoiceName ? (
                    <p className="text-destructive text-xs">
                      {form.errors.invoiceName}
                    </p>
                  ) : null}
                </div>

                {/* Invoice: VAT */}
                <div className="space-y-2">
                  <label
                    className="font-semibold text-sm"
                    htmlFor="invoice-vat"
                  >
                    {t("web.sponsors.wizard.invoiceVatLabel")} *
                  </label>
                  <Input
                    className={`h-14 rounded-xl text-base ${form.errors.invoiceVatNumber ? "border-destructive" : ""}`}
                    id="invoice-vat"
                    onChange={handleInvoiceVatNumberChange}
                    placeholder={t("web.sponsors.wizard.invoiceVatPlaceholder")}
                    value={form.invoiceVatNumber}
                  />
                  {form.errors.invoiceVatNumber ? (
                    <p className="text-destructive text-xs">
                      {form.errors.invoiceVatNumber}
                    </p>
                  ) : null}
                </div>

                {/* Invoice: Email */}
                <div className="space-y-2">
                  <label
                    className="font-semibold text-sm"
                    htmlFor="invoice-email"
                  >
                    {t("web.sponsors.wizard.invoiceEmailLabel")} *
                  </label>
                  <Input
                    className={`h-14 rounded-xl text-base ${form.errors.invoiceEmail ? "border-destructive" : ""}`}
                    id="invoice-email"
                    onChange={handleInvoiceEmailChange}
                    placeholder={t(
                      "web.sponsors.wizard.invoiceEmailPlaceholder"
                    )}
                    type="email"
                    value={form.invoiceEmail}
                  />
                  {form.errors.invoiceEmail ? (
                    <p className="text-destructive text-xs">
                      {form.errors.invoiceEmail}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
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
                    count: form.selectedGestureIds.length,
                  })}
                </span>
                <span>
                  {formatPrice(
                    form.selectedGestureIds.length * PRICE_PER_YEAR_CENTS,
                    i18n.resolvedLanguage ?? i18n.language
                  )}
                </span>
              </div>
              {form.includeLogo ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("web.sponsors.wizard.logoAddon")}
                  </span>
                  <span>
                    {formatPrice(
                      LOGO_ADDON_CENTS * form.selectedGestureIds.length,
                      i18n.resolvedLanguage ?? i18n.language
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-primary/20 border-t pt-2 font-bold text-lg">
                <span>{t("web.sponsors.wizard.total")}</span>
                <span className="text-primary">
                  {formatPrice(
                    form.selectedGestureIds.length * PRICE_PER_YEAR_CENTS +
                      (form.includeLogo
                        ? LOGO_ADDON_CENTS * form.selectedGestureIds.length
                        : 0),
                    i18n.resolvedLanguage ?? i18n.language
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed footer CTA */}
      <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background/95 px-4 py-4 shadow-lg backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <Button
            className="progress-button h-14 w-full rounded-xl font-semibold text-base"
            data-progress={form.isGeneratingPreview ? "true" : undefined}
            disabled={form.isGeneratingPreview}
            onClick={onGeneratePreview}
            size="lg"
            style={
              form.isGeneratingPreview
                ? ({
                    "--progress": form.previewProgress,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {form.isGeneratingPreview ? (
              <div
                className="pointer-events-none absolute inset-0 bg-white/20 transition-transform duration-300 ease-out"
                style={{
                  transform: `translateX(${(form.previewProgress - 1) * 100}%)`,
                }}
              />
            ) : null}
            <span className="relative z-10 flex items-center">
              {form.isGeneratingPreview ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("web.sponsors.wizard.generatingPreview")}
                  <span className="ml-2 tabular-nums">
                    {Math.round(form.previewProgress * 100)}%
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
  );
}
