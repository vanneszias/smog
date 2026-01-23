import { useCallback, useEffect, useState } from "react";

declare const document: { cookie: string } | undefined;

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

const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieValue = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));

  if (!cookieValue) {
    return null;
  }

  return decodeURIComponent(cookieValue.split("=")[1] || "");
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${CONSENT_COOKIE_MAX_AGE}; samesite=lax`;
}

function getStoredConsent(): AnalyticsConsentStatus | null {
  try {
    const consent = readCookie("smog_analytics_consent");
    if (consent === null) {
      return null;
    }
    return {
      hasConsent: true,
      analyticsConsent: consent === "true",
      marketingConsent: readCookie("smog_marketing_consent") === "true",
      consentDate: readCookie("smog_consent_date") || undefined,
    };
  } catch {
    return null;
  }
}

export { getStoredConsent };

function saveConsent(status: AnalyticsConsentStatus): void {
  try {
    writeCookie("smog_analytics_consent", status.analyticsConsent.toString());
    writeCookie("smog_marketing_consent", status.marketingConsent.toString());
    writeCookie(
      "smog_consent_date",
      status.consentDate || new Date().toISOString()
    );
    writeCookie("smog_gdpr_consent", "accepted");
  } catch {
    console.debug("[Analytics] Unable to persist consent");
  }
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
