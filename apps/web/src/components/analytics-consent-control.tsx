import { useSyncExternalStore } from "react";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from "@/lib/openpanel";
import { Button } from "./ui/button";

export function AnalyticsConsentControl() {
  const consent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent
  );

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <p className="mb-3 text-sm">
        Huidige keuze:{" "}
        <strong>
          {consent === true
            ? "analytics toegestaan"
            : "analytics uitgeschakeld"}
        </strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAnalyticsConsent(true)} size="sm">
          Analytics toestaan
        </Button>
        <Button
          onClick={() => setAnalyticsConsent(false)}
          size="sm"
          variant="outline"
        >
          Toestemming intrekken
        </Button>
      </div>
    </div>
  );
}
