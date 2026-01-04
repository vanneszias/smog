import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

export function GDPRConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(true);

  useEffect(() => {
    const consent = localStorage.getItem("smog_gdpr_consent");
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem("smog_gdpr_consent", "accepted");
    localStorage.setItem("smog_analytics_consent", "true");
    localStorage.setItem("smog_consent_version", "1.0");
    localStorage.setItem("smog_consent_date", new Date().toISOString());
    setShowBanner(false);
  };

  const handleAcceptRequired = () => {
    localStorage.setItem("smog_gdpr_consent", "accepted");
    localStorage.setItem("smog_analytics_consent", "false");
    localStorage.setItem("smog_consent_version", "1.0");
    localStorage.setItem("smog_consent_date", new Date().toISOString());
    setShowBanner(false);
  };

  const handleCustomize = () => {
    localStorage.setItem("smog_gdpr_consent", "accepted");
    localStorage.setItem("smog_analytics_consent", analyticsConsent.toString());
    localStorage.setItem("smog_consent_version", "1.0");
    localStorage.setItem("smog_consent_date", new Date().toISOString());
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
              checked={analyticsConsent}
              onCheckedChange={setAnalyticsConsent}
            />
            <span className="text-sm">
              Usage Analytics (Help us improve the app)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleAcceptAll}>Accept All</Button>
          <Button onClick={handleCustomize} variant="outline">
            Save Preferences
          </Button>
          <Button onClick={handleAcceptRequired} variant="outline">
            Required Only
          </Button>
        </div>
      </div>
    </div>
  );
}
