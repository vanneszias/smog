import { api } from "@smog/convex";
import { type AnalyticsConsentStatus, useAnalyticsConsent } from "@smog/hooks";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { onConsentChange } from "@/lib/analytics";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export function GDPRConsentBanner() {
  const { grantConsent, revokeConsent, updateConsent, consent, isLoading } =
    useAnalyticsConsent({
      onConsentChange: (enabled) => {
        const newConsent: AnalyticsConsentStatus = {
          hasConsent: true,
          analyticsConsent: enabled,
          marketingConsent: consent?.marketingConsent ?? false,
          consentDate: new Date().toISOString(),
        };
        onConsentChange(newConsent);
      },
    });

  const shouldCheckDb = !(isLoading || consent?.hasConsent);
  const consentStatus = useQuery(
    api.gdpr.getConsentStatus,
    shouldCheckDb ? {} : "skip"
  );

  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isLoading || (shouldCheckDb && consentStatus === undefined)) {
      return;
    }

    const hasDbConsent = consentStatus?.hasConsent === true;
    setShowBanner(!(consent?.hasConsent || hasDbConsent));
  }, [consent?.hasConsent, consentStatus, isLoading, shouldCheckDb]);

  useEffect(() => {
    if (!consentStatus?.hasConsent || consent?.hasConsent) {
      return;
    }

    updateConsent(
      consentStatus.analyticsConsent,
      consentStatus.marketingConsent
    );
  }, [consentStatus, consent?.hasConsent, updateConsent]);

  const handleAcceptAll = () => {
    grantConsent();
    setShowBanner(false);
  };

  const handleCustomize = (analyticsEnabled: boolean) => {
    updateConsent(analyticsEnabled, false);
    setShowBanner(false);
  };

  const handleRequiredOnly = () => {
    revokeConsent();
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed right-0 bottom-0 left-0 z-50 border-border border-t bg-background p-4 shadow-lg">
      <div className="container mx-auto max-w-6xl">
        <h3 className="mb-2 font-semibold text-lg">Privacy & Data Usage</h3>
        <p className="mb-4 text-muted-foreground text-sm">
          We respect your privacy and are committed to protecting your personal
          data. Learn more in our{" "}
          <Link className="text-blue-600 underline" to="/privacy">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link className="text-blue-600 underline" to="/terms">
            Terms of Service
          </Link>
          .
        </p>

        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={consent?.analyticsConsent ?? false}
              onCheckedChange={(checked) => handleCustomize(checked)}
            />
            <span className="text-sm">
              Usage Analytics (Help us improve the app)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleAcceptAll}>Accept All</Button>
          <Button onClick={handleRequiredOnly} variant="outline">
            Required Only
          </Button>
        </div>
      </div>
    </div>
  );
}
