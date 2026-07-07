import MuxPlayer from "@mux/mux-player-react/lazy";
import { createLogger } from "@smog/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ImagePlus,
  Lock,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/utils/orpc";

const logger = createLogger("sponsorsReEdit");

interface SearchParams {
  token: string;
}

interface ReEditSponsorship {
  _id: string;
  gestureId: string;
  gestureName?: string;
  sponsorName: string;
  sponsorEmail: string;
  contactFullName: string;
  contactCompany?: string;
  overlayText: string;
  hasLogo?: boolean;
  originalVideoPlaybackId: string;
  status: string;
  reEditTokenExpiresAt?: number;
}

type TokenResult =
  | { expired: true; sponsorship?: undefined }
  | { expired: false; sponsorship: ReEditSponsorship }
  | null;

export const Route = createFileRoute("/sponsors/re-edit")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: (search.token as string) || "",
  }),
  component: ReEditComponent,
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-step wizard requires complex state management
function ReEditComponent() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();

  const {
    data: tokenResult,
    isLoading,
    error,
  } = useQuery<TokenResult>({
    queryKey: ["re-edit-token", token],
    queryFn: () =>
      client.sponsorships.getByReEditToken({ token }) as Promise<TokenResult>,
    enabled: !!token,
    retry: false,
  });

  const [sponsorName, setSponsorName] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewPlaybackId, setPreviewPlaybackId] = useState<string | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (tokenResult && !tokenResult.expired && tokenResult.sponsorship) {
      setSponsorName(tokenResult.sponsorship.sponsorName);
      setOverlayText(tokenResult.sponsorship.overlayText);
    }
  }, [tokenResult]);

  const resetPreview = () => {
    setPreviewPlaybackId(null);
  };

  const readLogoBase64 = (): Promise<string | undefined> => {
    if (!logoFile) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(logoFile);
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError(t("web.sponsors.reEdit.errors.logoTooLarge"));
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoError(t("web.sponsors.reEdit.errors.logoInvalidFormat"));
      return;
    }
    setLogoFile(file);
    setLogoError(null);
    resetPreview();
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    resetPreview();
  };

  const handleGeneratePreview = async () => {
    if (!tokenResult || tokenResult.expired || !tokenResult.sponsorship) {
      return;
    }
    if (!sponsorName.trim()) {
      toast.error(t("web.sponsors.reEdit.errors.brandRequired"));
      return;
    }
    if (!overlayText.trim()) {
      toast.error(t("web.sponsors.reEdit.errors.overlayRequired"));
      return;
    }
    setIsGeneratingPreview(true);
    setPreviewPlaybackId(null);
    try {
      const logoBase64 = await readLogoBase64();
      const result = await client.sponsorships.generatePreview({
        gestureId: tokenResult.sponsorship.gestureId,
        sponsorName: sponsorName.trim(),
        logoImage: logoBase64,
        overlayText: overlayText.trim(),
      });
      setPreviewPlaybackId(result.playbackId);
    } catch (err) {
      logger.error("[ReEdit] Failed to generate preview:", err);
      toast.error(t("web.sponsors.reEdit.errors.previewFailed"));
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleSubmit = async () => {
    if (!tokenResult || tokenResult.expired || !tokenResult.sponsorship) {
      return;
    }
    if (!previewPlaybackId) {
      toast.error(t("web.sponsors.reEdit.errors.generateFirst"));
      return;
    }
    if (!(sponsorName.trim() && overlayText.trim())) {
      toast.error(t("web.sponsors.reEdit.errors.fillRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      const logoBase64 = await readLogoBase64();
      await client.sponsorships.reSubmitSponsorship({
        token,
        gestureId: tokenResult.sponsorship.gestureId,
        logoImage: logoBase64,
        overlayText: overlayText.trim(),
        sponsorName: sponsorName.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      logger.error("[ReEdit] Failed to submit:", err);
      toast.error(t("web.sponsors.reEdit.errors.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Guard screens ──────────────────────────────────────────────────────────

  if (!token) {
    return (
      <GuardScreen
        body={t("web.sponsors.reEdit.invalidBody")}
        color="red"
        icon={<AlertTriangle className="h-8 w-8" />}
        title={t("web.sponsors.reEdit.invalidTitle")}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        {t("web.sponsors.reEdit.loading")}
      </div>
    );
  }

  if (error || !tokenResult) {
    return (
      <GuardScreen
        body={t("web.sponsors.reEdit.notFoundBody")}
        color="red"
        icon={<AlertTriangle className="h-8 w-8" />}
        title={t("web.sponsors.reEdit.notFoundTitle")}
      />
    );
  }

  if (tokenResult.expired) {
    return (
      <GuardScreen
        body={t("web.sponsors.reEdit.expiredBody")}
        color="amber"
        icon={<Clock className="h-8 w-8" />}
        title={t("web.sponsors.reEdit.expiredTitle")}
      />
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>
        <h2 className="font-bold text-2xl">
          {t("web.sponsors.reEdit.submittedTitle")}
        </h2>
        <p className="max-w-sm text-muted-foreground">
          {t("web.sponsors.reEdit.submittedBody")}
        </p>
        <a
          className="mt-2 font-semibold text-primary text-sm hover:underline"
          href="/"
        >
          ← {t("web.sponsors.reEdit.backToSite")}
        </a>
      </div>
    );
  }

  const { sponsorship } = tokenResult;
  const hasLogo = sponsorship.hasLogo ?? false;
  const expiresAt = sponsorship.reEditTokenExpiresAt;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const stepNum = (n: number) => (hasLogo ? n : n < 3 ? n : n - 1);

  // ── Main page ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <header className="border-border border-b bg-gradient-to-b from-background to-muted/20 px-4 pt-safe-top">
        <div className="mx-auto max-w-2xl py-8">
          <p className="mb-1 text-muted-foreground text-sm">
            {t("web.sponsors.reEdit.eyebrow")}
          </p>
          <h1 className="font-bold text-3xl tracking-tight">
            {t("web.sponsors.reEdit.title")}
          </h1>
          {sponsorship.gestureName && (
            <p className="mt-1 text-muted-foreground">
              {t("web.sponsors.reEdit.gesture")}:{" "}
              <span className="font-medium text-foreground">
                {sponsorship.gestureName}
              </span>
            </p>
          )}
          {daysLeft !== null && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-amber-600 text-sm dark:text-amber-400">
              <Clock className="h-3.5 w-3.5" />
              {t("web.sponsors.reEdit.expires", { count: daysLeft })}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-16">
        {/* Original video */}
        <div className="overflow-hidden rounded-2xl border-2 border-border shadow-sm">
          <div className="border-border border-b bg-card px-4 py-2.5">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t("web.sponsors.reEdit.originalVideo")}
            </p>
          </div>
          <MuxPlayer
            loop
            muted
            playbackId={sponsorship.originalVideoPlaybackId}
            streamType="on-demand"
            style={{ width: "100%", aspectRatio: "16/9" }}
          />
        </div>

        {/* Step 1 — Edit details */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-5 flex items-center gap-2.5 font-bold text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
              {stepNum(1)}
            </span>
            {t("web.sponsors.reEdit.editDetails")}
          </h2>

          <div className="space-y-5">
            {/* Gesture — locked */}
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-semibold text-sm">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                {t("web.sponsors.reEdit.gesture")}
              </p>
              <div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3.5 text-muted-foreground text-sm italic">
                {sponsorship.gestureName}
              </div>
            </div>

            {/* Brand name */}
            <div className="space-y-1.5">
              <label
                className="font-semibold text-sm"
                htmlFor="field-sponsor-name"
              >
                {t("web.sponsors.reEdit.brandName")}{" "}
                <span className="font-normal text-primary">*</span>
              </label>
              <Input
                className="h-11 rounded-xl"
                id="field-sponsor-name"
                maxLength={40}
                onChange={(e) => {
                  setSponsorName(e.target.value);
                  resetPreview();
                }}
                placeholder={t("web.sponsors.reEdit.brandPlaceholder")}
                value={sponsorName}
              />
              <p className="text-muted-foreground text-xs">
                {t("web.sponsors.reEdit.brandHelp")}
              </p>
            </div>

            {/* Overlay text */}
            <div className="space-y-1.5">
              <label
                className="font-semibold text-sm"
                htmlFor="field-overlay-text"
              >
                {t("web.sponsors.reEdit.overlayText")}{" "}
                <span className="font-normal text-primary">*</span>
              </label>
              <Input
                className="h-11 rounded-xl"
                id="field-overlay-text"
                maxLength={100}
                onChange={(e) => {
                  setOverlayText(e.target.value);
                  resetPreview();
                }}
                placeholder={t("web.sponsors.reEdit.overlayPlaceholder")}
                value={overlayText}
              />
              <p className="text-muted-foreground text-xs">
                {t("web.sponsors.reEdit.maxCharacters")}
              </p>
            </div>
          </div>
        </section>

        {/* Step 2 — Logo (conditional) */}
        {hasLogo && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-5 flex items-center gap-2.5 font-bold text-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
                2
              </span>
              {t("web.sponsors.reEdit.updateLogo")}
            </h2>

            {logoPreview ? (
              <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-4">
                <img
                  alt={t("web.sponsors.reEdit.logoAlt")}
                  className="h-16 w-16 rounded-lg border border-border bg-card object-contain"
                  height={64}
                  src={logoPreview}
                  width={64}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {logoFile?.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : ""}
                  </p>
                </div>
                <button
                  aria-label={t("web.sponsors.reEdit.removeLogo")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleRemoveLogo}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-border border-dashed p-8 text-center transition-all hover:border-primary hover:bg-primary/5"
                htmlFor="logo-upload"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ImagePlus className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {t("web.sponsors.reEdit.uploadLogo")}
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {t("web.sponsors.reEdit.formats")}
                  </p>
                </div>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  id="logo-upload"
                  onChange={handleLogoUpload}
                  type="file"
                />
              </label>
            )}
            {logoError && (
              <p className="mt-2 text-destructive text-xs">{logoError}</p>
            )}
          </section>
        )}

        {/* Step — Preview */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 font-bold text-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary text-sm">
                {stepNum(hasLogo ? 3 : 2)}
              </span>
              {t("web.sponsors.reEdit.preview")}
            </h2>
            <Button
              disabled={isGeneratingPreview}
              onClick={handleGeneratePreview}
              size="sm"
              variant="outline"
            >
              {isGeneratingPreview ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("web.sponsors.reEdit.generating")}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {previewPlaybackId
                    ? t("web.sponsors.reEdit.regenerate")
                    : t("web.sponsors.reEdit.generatePreview")}
                </>
              )}
            </Button>
          </div>

          {isGeneratingPreview && (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-primary/20 bg-primary/5 text-muted-foreground text-sm">
              <RefreshCw className="h-7 w-7 animate-spin text-primary" />
              {t("web.sponsors.reEdit.compositing")}
            </div>
          )}

          {previewPlaybackId && !isGeneratingPreview && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border">
                <MuxPlayer
                  loop
                  muted
                  playbackId={previewPlaybackId}
                  streamType="on-demand"
                  style={{ width: "100%", aspectRatio: "16/9" }}
                />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-primary text-sm">
                <CheckCircle className="h-4 w-4 shrink-0" />
                {t("web.sponsors.reEdit.previewReady")}
              </div>
            </div>
          )}

          {!(previewPlaybackId || isGeneratingPreview) && (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed text-muted-foreground text-sm">
              <RefreshCw className="h-8 w-8 opacity-20" />
              {t("web.sponsors.reEdit.previewEmpty")}
            </div>
          )}
        </section>

        {/* Submit */}
        <div className="flex flex-col items-center gap-3">
          <Button
            className="h-14 w-full max-w-sm gap-2 rounded-xl font-semibold text-base"
            disabled={!previewPlaybackId || isSubmitting}
            onClick={handleSubmit}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                {t("web.sponsors.reEdit.submitting")}
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                {t("web.sponsors.reEdit.submitReview")}
              </>
            )}
          </Button>
          <p className="text-center text-muted-foreground text-sm">
            {t("web.sponsors.reEdit.noPayment")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Guard screen helper ──────────────────────────────────────────────────────

function GuardScreen({
  icon,
  title,
  body,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  color: "red" | "amber";
}) {
  const { t } = useTranslation();
  const iconBg =
    color === "red"
      ? "bg-destructive/10 text-destructive"
      : "bg-amber-500/10 text-amber-600 dark:text-amber-400";

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl ${iconBg}`}
      >
        {icon}
      </div>
      <h2 className="font-bold text-2xl">{title}</h2>
      <p className="max-w-sm text-muted-foreground leading-relaxed">{body}</p>
      <a
        className="mt-2 font-semibold text-primary text-sm hover:underline"
        href="/"
      >
        ← {t("web.sponsors.reEdit.backToSite")}
      </a>
    </div>
  );
}
