import { useCallback, useEffect, useState } from "react";

declare const window: { localStorage: Storage };

export type AnalyticsConsentStatus = {
  hasConsent: boolean;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  consentDate?: string;
};

function createConsent(
  analytics: boolean,
  marketing: boolean
): AnalyticsConsentStatus {
  return {
    hasConsent: true,
    analyticsConsent: analytics,
    marketingConsent: marketing,
    consentDate: new Date().toISOString(),
  };
}

function getStoredConsent(): AnalyticsConsentStatus | null {
  if (typeof window === "undefined") {
    return null;
  }
  const consent = localStorage.getItem("smog_analytics_consent");
  if (consent === null) {
    return null;
  }
  return {
    hasConsent: true,
    analyticsConsent: consent === "true",
    marketingConsent: localStorage.getItem("smog_marketing_consent") === "true",
    consentDate: localStorage.getItem("smog_consent_date") || undefined,
  };
}

export { getStoredConsent };

function saveConsent(status: AnalyticsConsentStatus): void {
  localStorage.setItem(
    "smog_analytics_consent",
    status.analyticsConsent.toString()
  );
  localStorage.setItem(
    "smog_marketing_consent",
    status.marketingConsent.toString()
  );
  localStorage.setItem(
    "smog_consent_date",
    status.consentDate || new Date().toISOString()
  );
  localStorage.setItem("smog_gdpr_consent", "accepted");
}

export type UseAnalyticsConsentOptions = {
  onConsentChange?: (consent: boolean) => void;
};

export function useAnalyticsConsent(options: UseAnalyticsConsentOptions = {}): {
  consent: AnalyticsConsentStatus | null;
  grantConsent: () => void;
  revokeConsent: () => void;
  updateConsent: (analytics: boolean, marketing?: boolean) => void;
  isLoading: boolean;
} {
  const { onConsentChange } = options;
  const [consent, setConsent] = useState<AnalyticsConsentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredConsent();
    setConsent(stored);
    setIsLoading(false);
  }, []);

  const updateConsentState = useCallback(
    (newConsent: AnalyticsConsentStatus) => {
      saveConsent(newConsent);
      setConsent(newConsent);
      onConsentChange?.(newConsent.analyticsConsent);
    },
    [onConsentChange]
  );

  const grantConsent = useCallback(() => {
    updateConsentState(createConsent(true, false));
  }, [updateConsentState]);

  const revokeConsent = useCallback(() => {
    updateConsentState(createConsent(false, false));
  }, [updateConsentState]);

  const updateConsent = useCallback(
    (analytics: boolean, marketing?: boolean) => {
      updateConsentState(createConsent(analytics, marketing ?? false));
    },
    [updateConsentState]
  );

  return {
    consent,
    grantConsent,
    revokeConsent,
    updateConsent,
    isLoading,
  };
}

export function isAnalyticsEnabled(
  consent: AnalyticsConsentStatus | null
): boolean {
  return consent?.analyticsConsent === true;
}
