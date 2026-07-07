import { Linking, Modal, StyleSheet, Text, View } from "react-native";
import BaseButton from "@/components/common/BaseButton";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { setAnalyticsConsent } from "@/lib/openpanel";

interface AnalyticsConsentPromptProps {
  visible: boolean;
}

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
            onPress={() =>
              Linking.openURL("https://app.smog.vlaanderen/privacy")
            }
            style={[styles.link, { color: theme.primary }]}
          >
            {t("settings.privacyPolicy")}
          </Text>
          <View style={styles.actions}>
            <BaseButton
              onPress={async () => {
                await setAnalyticsConsent(true);
              }}
              size="large"
              title={t("settings.analyticsAllow")}
            />
            <BaseButton
              onPress={async () => {
                await setAnalyticsConsent(false);
              }}
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
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
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
  actions: {
    gap: 12,
  },
});
