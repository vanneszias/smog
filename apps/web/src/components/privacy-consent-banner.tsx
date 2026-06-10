import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/openpanel";
import { Button } from "./ui/button";

export function PrivacyConsentBanner() {
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
        <h2 className="mb-2 font-semibold text-lg">Privacy en analytics</h2>
        <p className="mb-4 text-muted-foreground text-sm">
          Met uw toestemming verzamelen we beperkte gebruiksgegevens via onze
          zelfgehoste OpenPanel-installatie. We slaan geen zoektermen of
          sessie-opnames op. Lees meer in ons{" "}
          <Link className="text-primary underline" to="/privacy">
            privacybeleid
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAnalyticsConsent(true)}>
            Analytics toestaan
          </Button>
          <Button onClick={() => setAnalyticsConsent(false)} variant="outline">
            Alleen noodzakelijk
          </Button>
        </div>
      </div>
    </div>
  );
}
