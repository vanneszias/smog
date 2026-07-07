import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/openpanel";
import { Button } from "./ui/button";

export function PrivacyConsentBanner() {
  const { t } = useTranslation();
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent
  );

  if (consent !== null) {
    return null;
  }

  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background p-4 shadow-lg">
      <div className="container mx-auto max-w-4xl">
        <h2 className="mb-2 font-semibold text-lg">
          {t("settings.analyticsPromptTitle")}
        </h2>
        <p className="mb-4 text-muted-foreground text-sm">
          {t("settings.analyticsPromptDescription")}{" "}
          <Link className="text-primary underline" to="/privacy">
            {t("settings.privacyPolicy")}
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAnalyticsConsent(true)}>
            {t("settings.analyticsAllow")}
          </Button>
          <Button onClick={() => setAnalyticsConsent(false)} variant="outline">
            {t("settings.analyticsRequiredOnly")}
          </Button>
        </div>
      </div>
    </div>
  );
}
