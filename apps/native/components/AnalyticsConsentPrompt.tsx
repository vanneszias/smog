import { Linking, Modal, StyleSheet, Text, View } from "react-native";
import BaseButton from "@/components/common/BaseButton";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { setAnalyticsConsent } from "@/lib/openpanel";

interface AnalyticsConsentPromptProps {
  visible: boolean;
}

const openPrivacyPolicy = (): Promise<unknown> =>
  Linking.openURL("https://app.smog.vlaanderen/privacy");

const handleAllow = async (): Promise<void> => {
  await setAnalyticsConsent(true);
};

const handleRequiredOnly = async (): Promise<void> => {
  await setAnalyticsConsent(false);
};

export function AnalyticsConsentPrompt({
  visible,
}: AnalyticsConsentPromptProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t("settings.analyticsPromptTitle")}
          </Text>
          <Text style={[styles.description, { color: theme.textLight }]}>
            {t("settings.analyticsPromptDescription")}
          </Text>
          <Text
            onPress={openPrivacyPolicy}
            style={[styles.link, { color: theme.primary }]}
          >
            {t("settings.privacyPolicy")}
          </Text>
          <View style={styles.actions}>
            <BaseButton
              onPress={handleAllow}
              size="large"
              title={t("settings.analyticsAllow")}
            />
            <BaseButton
              onPress={handleRequiredOnly}
              size="large"
              title={t("settings.analyticsRequiredOnly")}
              variant="outline"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 16,
    maxWidth: 480,
    padding: 24,
    width: "100%",
  },
  description: {
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 12,
  },
  link: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 20,
    textDecorationLine: "underline",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
});
