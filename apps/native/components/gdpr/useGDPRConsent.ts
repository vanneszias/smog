/**
 * @fileoverview GDPR consent modal state and action hook.
 *
 * Separates consent management logic from the UI component so
 * `GDPRConsentModal` stays focused on rendering.
 *
 * @example
 * const consent = useGDPRConsent({ onAcceptAll, onAcceptRequired });
 * <Switch value={consent.analyticsConsent} onValueChange={consent.setAnalyticsConsent} />
 * <Button onPress={consent.handleAcceptAll} />
 */

import { useState } from "react";
import { Alert } from "react-native";

interface UseGDPRConsentOptions {
  /** Called with `true/false` for analytics consent when user accepts all or customises. */
  onAcceptAll: (analyticsConsent: boolean) => Promise<void>;
  /** Called when user accepts only required cookies. */
  onAcceptRequired: () => Promise<void>;
  /** Translation function for error messages. */
  t: (key: string) => string;
}

/**
 * Manages GDPR consent UI state and wraps the async consent handlers with
 * error handling and loading state.
 */
export function useGDPRConsent({
  onAcceptAll,
  onAcceptRequired,
  t,
}: UseGDPRConsentOptions) {
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAcceptAll = async () => {
    setLoading(true);
    try {
      await onAcceptAll(true);
    } catch {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequired = async () => {
    setLoading(true);
    try {
      await onAcceptRequired();
    } catch {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomAccept = async () => {
    setLoading(true);
    try {
      await onAcceptAll(analyticsConsent);
    } catch {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  return {
    analyticsConsent,
    setAnalyticsConsent,
    loading,
    handleAcceptAll,
    handleAcceptRequired,
    handleCustomAccept,
  };
}
