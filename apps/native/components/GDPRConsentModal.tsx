/**
 * @fileoverview GDPR consent modal for the SMOG native app.
 *
 * Shows a modal asking the user to consent to required cookies and optionally
 * to analytics tracking. The user can:
 * - Accept all (required + analytics)
 * - Customise (set analytics toggle then accept)
 * - Accept required only
 *
 * All state and action logic is handled by `useGDPRConsent`; this file
 * contains only the UI rendering.
 *
 * @see components/gdpr/useGDPRConsent.ts
 *
 * @a11y
 * - Modal blocks backdrop interaction to prevent closing without accepting.
 * - Analytics switch is labelled by the section title.
 * - All buttons have visible text labels.
 */

import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useGDPRConsent } from "./gdpr/useGDPRConsent";

interface GDPRConsentModalProps {
  /** Whether the modal is visible. */
  visible: boolean;
  /**
   * Called when the user accepts. Receives `analyticsConsent: boolean`.
   * When the user clicks "Accept all", this is called with `true`.
   * When the user customises, this is called with the current toggle value.
   */
  onAcceptAll: (analyticsConsent: boolean) => Promise<void>;
  /** Called when the user accepts required cookies only. */
  onAcceptRequired: () => Promise<void>;
}

export default function GDPRConsentModal({
  visible,
  onAcceptAll,
  onAcceptRequired,
}: GDPRConsentModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const consent = useGDPRConsent({ onAcceptAll, onAcceptRequired, t });

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        /* Prevent closing without accepting */
      }}
      transparent={true}
      visible={visible}
    >
      <View style={styles.centeredView}>
        <View
          style={[
            styles.modalView,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text
              style={[
                styles.title,
                { color: theme.text, fontFamily: "Onest-Bold" },
              ]}
            >
              {t("gdpr.consent.title")}
            </Text>

            <Text
              style={[
                styles.description,
                { color: theme.textLight, fontFamily: "Onest-Regular" },
              ]}
            >
              {t("gdpr.consent.description")}
            </Text>

            {/* Required Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.text, fontFamily: "Onest-SemiBold" },
                  ]}
                >
                  {t("gdpr.consent.requiredTitle")}
                </Text>
                <View
                  style={[styles.badge, { backgroundColor: theme.primary }]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: theme.background, fontFamily: "Onest-Medium" },
                    ]}
                  >
                    Required
                  </Text>
                </View>
              </View>
              <Text
                style={[
                  styles.sectionDescription,
                  { color: theme.textLight, fontFamily: "Onest-Regular" },
                ]}
              >
                {t("gdpr.consent.requiredDescription")}
              </Text>
            </View>

            {/* Analytics Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.text, fontFamily: "Onest-SemiBold" },
                  ]}
                >
                  {t("gdpr.consent.analyticsTitle")}
                </Text>
                <Switch
                  disabled={consent.loading}
                  onValueChange={consent.setAnalyticsConsent}
                  thumbColor={theme.background}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  value={consent.analyticsConsent}
                />
              </View>
              <Text
                style={[
                  styles.sectionDescription,
                  { color: theme.textLight, fontFamily: "Onest-Regular" },
                ]}
              >
                {t("gdpr.consent.analyticsDescription")}
              </Text>
            </View>

            {/* Legal Links */}
            <View style={styles.legalSection}>
              <Text
                style={[
                  styles.legalText,
                  { color: theme.textLight, fontFamily: "Onest-Regular" },
                ]}
              >
                {t("gdpr.consent.learnMore")}{" "}
                <Text
                  onPress={() =>
                    Linking.openURL("https://app.smog.vlaanderen/privacy")
                  }
                  style={[styles.link, { color: theme.primary }]}
                >
                  {t("gdpr.consent.privacyPolicy")}
                </Text>{" "}
                {t("gdpr.consent.and")}{" "}
                <Text
                  onPress={() =>
                    Linking.openURL("https://app.smog.vlaanderen/terms")
                  }
                  style={[styles.link, { color: theme.primary }]}
                >
                  {t("gdpr.consent.termsOfService")}
                </Text>
                .
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              disabled={consent.loading}
              onPress={consent.handleAcceptAll}
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.background, fontFamily: "Onest-SemiBold" },
                ]}
              >
                {consent.loading ? "..." : t("gdpr.consent.acceptAll")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={consent.loading}
              onPress={consent.handleCustomAccept}
              style={[
                styles.secondaryButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.text, fontFamily: "Onest-SemiBold" },
                ]}
              >
                {t("gdpr.consent.customize")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={consent.loading}
              onPress={consent.handleAcceptRequired}
              style={[
                styles.secondaryButton,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                },
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.text, fontFamily: "Onest-SemiBold" },
                ]}
              >
                {t("gdpr.consent.acceptRequired")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    width: "90%",
    maxHeight: "80%",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
  },
  title: { fontSize: 24, marginBottom: 12 },
  description: { fontSize: 16, marginBottom: 24, lineHeight: 22 },
  section: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.02)",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, flex: 1 },
  sectionDescription: { fontSize: 14, lineHeight: 20 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12 },
  legalSection: { marginTop: 8, marginBottom: 24 },
  legalText: { fontSize: 13, lineHeight: 19 },
  link: { textDecorationLine: "underline" },
  buttonContainer: { gap: 12 },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  buttonText: { fontSize: 16 },
});
