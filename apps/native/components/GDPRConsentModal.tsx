import { useState } from "react";
import {
  Alert,
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

type GDPRConsentModalProps = {
  visible: boolean;
  onAcceptAll: (analyticsConsent: boolean) => Promise<void>;
  onAcceptRequired: () => Promise<void>;
};

export default function GDPRConsentModal({
  visible,
  onAcceptAll,
  onAcceptRequired,
}: GDPRConsentModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [analyticsConsent, setAnalyticsConsent] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAcceptAll = async () => {
    setLoading(true);
    try {
      await onAcceptAll(true);
    } catch (_error) {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequired = async () => {
    setLoading(true);
    try {
      await onAcceptRequired();
    } catch (_error) {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomAccept = async () => {
    setLoading(true);
    try {
      await onAcceptAll(analyticsConsent);
    } catch (_error) {
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
    } finally {
      setLoading(false);
    }
  };

  const openPrivacyPolicy = () => {
    // Update with your actual privacy policy URL
    Linking.openURL("https://smog.app/privacy");
  };

  const openTerms = () => {
    // Update with your actual terms URL
    Linking.openURL("https://smog.app/terms");
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        // Prevent closing without accepting
      }}
      transparent={true}
      visible={visible}
    >
      <View style={styles.centeredView}>
        <View
          style={[
            styles.modalView,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
            },
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
                { color: theme.textSecondary, fontFamily: "Onest-Regular" },
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
                  {
                    color: theme.textSecondary,
                    fontFamily: "Onest-Regular",
                  },
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
                  disabled={loading}
                  onValueChange={setAnalyticsConsent}
                  thumbColor={theme.background}
                  trackColor={{
                    false: theme.border,
                    true: theme.primary,
                  }}
                  value={analyticsConsent}
                />
              </View>
              <Text
                style={[
                  styles.sectionDescription,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Onest-Regular",
                  },
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
                  {
                    color: theme.textSecondary,
                    fontFamily: "Onest-Regular",
                  },
                ]}
              >
                {t("gdpr.consent.learnMore")}{" "}
                <Text
                  onPress={openPrivacyPolicy}
                  style={[styles.link, { color: theme.primary }]}
                >
                  {t("gdpr.consent.privacyPolicy")}
                </Text>{" "}
                {t("gdpr.consent.and")}{" "}
                <Text
                  onPress={openTerms}
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
              disabled={loading}
              onPress={handleAcceptAll}
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: theme.background,
                    fontFamily: "Onest-SemiBold",
                  },
                ]}
              >
                {loading ? "..." : t("gdpr.consent.acceptAll")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={loading}
              onPress={handleCustomAccept}
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
              disabled={loading}
              onPress={handleAcceptRequired}
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
  },
  title: {
    fontSize: 24,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
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
  sectionTitle: {
    fontSize: 18,
    flex: 1,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
  },
  legalSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  legalText: {
    fontSize: 13,
    lineHeight: 19,
  },
  link: {
    textDecorationLine: "underline",
  },
  buttonContainer: {
    gap: 12,
  },
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
  buttonText: {
    fontSize: 16,
  },
});
