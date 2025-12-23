import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { api } from "@/convex/_generated/api";
import {
  disableAnalytics,
  enableAnalytics,
  isAnalyticsActive,
} from "@/services/analyticsService";

export default function AccountSettingsScreen() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const _consentStatus = useQuery(api.gdpr.getConsentStatus);
  const exportData = useQuery(api.gdpr.exportUserData);
  const deleteAccount = useMutation(api.gdpr.deleteUserAccount);
  const updateConsent = useMutation(api.gdpr.updateConsent);

  const [analyticsEnabled, setAnalyticsEnabled] = useState(isAnalyticsActive());
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAnalyticsToggle = async (value: boolean) => {
    try {
      setAnalyticsEnabled(value);

      // Update backend consent
      if (user?.workosId) {
        await updateConsent({ analyticsConsent: value });
      }

      // Update local analytics state
      if (value) {
        await enableAnalytics();
      } else {
        await disableAnalytics();
      }

      Alert.alert(t("common.success"), t("gdpr.consent.updated"));
    } catch (error) {
      console.error(
        "[AccountSettings] Failed to update analytics consent:",
        error
      );
      Alert.alert(t("common.error"), t("gdpr.consent.failed"));
      // Revert the switch
      setAnalyticsEnabled(!value);
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);

      if (!exportData) {
        Alert.alert(t("common.error"), t("gdpr.account.exportFailed"));
        return;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileName = `smog-data-export-${new Date().toISOString()}.json`;

      await Share.share({
        message: jsonString,
        title: fileName,
      });

      Alert.alert(t("common.success"), t("gdpr.account.exportSuccess"));
    } catch (error) {
      console.error("[AccountSettings] Failed to export data:", error);
      Alert.alert(t("common.error"), t("gdpr.account.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("gdpr.account.deleteConfirmTitle"),
      t("gdpr.account.deleteConfirmMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("gdpr.account.deleteConfirmButton"),
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);

              // Delete account in backend
              await deleteAccount({ confirmDelete: true });

              // Clear local storage
              await AsyncStorage.multiRemove([
                "@smog_gdpr_consent",
                "@smog_analytics_consent",
                "@smog_consent_version",
                "@smog_consent_date",
                "@smog_user",
                "@smog_guest_id",
                "@smog_guest_mode",
              ]);

              // Sign out
              await signOut();

              Alert.alert(
                t("common.success"),
                t("gdpr.account.deleteSuccess"),
                [
                  {
                    text: "OK",
                    onPress: () => router.replace("/welcome"),
                  },
                ]
              );
            } catch (error) {
              console.error(
                "[AccountSettings] Failed to delete account:",
                error
              );
              Alert.alert(t("common.error"), t("gdpr.account.deleteFailed"));
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.center}>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textSecondary, fontFamily: "Onest-Regular" },
            ]}
          >
            {t("account.guestModeDescription")}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/welcome")}
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
              {t("auth.welcome.signInSignUp")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Info */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.text, fontFamily: "Onest-SemiBold" },
            ]}
          >
            {t("account.accountInfo")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: theme.textSecondary, fontFamily: "Onest-Regular" },
              ]}
            >
              {t("auth.email")}
            </Text>
            <Text
              style={[
                styles.value,
                { color: theme.text, fontFamily: "Onest-Medium" },
              ]}
            >
              {user.email || t("account.unknownUser")}
            </Text>
          </View>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.text, fontFamily: "Onest-SemiBold" },
            ]}
          >
            {t("gdpr.account.analytics")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text
                  style={[
                    styles.settingLabel,
                    { color: theme.text, fontFamily: "Onest-Medium" },
                  ]}
                >
                  {t("gdpr.consent.analyticsTitle")}
                </Text>
                <Text
                  style={[
                    styles.settingDescription,
                    {
                      color: theme.textSecondary,
                      fontFamily: "Onest-Regular",
                    },
                  ]}
                >
                  {t("gdpr.account.analyticsDescription")}
                </Text>
              </View>
              <Switch
                onValueChange={handleAnalyticsToggle}
                thumbColor={theme.background}
                trackColor={{
                  false: theme.border,
                  true: theme.primary,
                }}
                value={analyticsEnabled}
              />
            </View>
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.text, fontFamily: "Onest-SemiBold" },
            ]}
          >
            {t("gdpr.account.manageData")}
          </Text>

          <TouchableOpacity
            disabled={isExporting || !exportData}
            onPress={handleExportData}
            style={[
              styles.card,
              styles.actionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View>
              <Text
                style={[
                  styles.actionTitle,
                  { color: theme.text, fontFamily: "Onest-SemiBold" },
                ]}
              >
                {t("gdpr.account.exportData")}
              </Text>
              <Text
                style={[
                  styles.actionDescription,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Onest-Regular",
                  },
                ]}
              >
                {t("gdpr.account.exportDescription")}
              </Text>
            </View>
            <Text
              style={[
                styles.actionButton,
                { color: theme.primary, fontFamily: "Onest-Medium" },
              ]}
            >
              {isExporting
                ? t("gdpr.account.exporting")
                : t("gdpr.account.exportButton")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text
            style={[
              styles.sectionTitle,
              { color: "#EF4444", fontFamily: "Onest-SemiBold" },
            ]}
          >
            {t("account.dangerZone")}
          </Text>

          <TouchableOpacity
            disabled={isDeleting}
            onPress={handleDeleteAccount}
            style={[
              styles.card,
              styles.actionCard,
              { backgroundColor: theme.surface, borderColor: "#FEE2E2" },
            ]}
          >
            <View>
              <Text
                style={[
                  styles.actionTitle,
                  { color: "#EF4444", fontFamily: "Onest-SemiBold" },
                ]}
              >
                {t("gdpr.account.deleteAccount")}
              </Text>
              <Text
                style={[
                  styles.actionDescription,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Onest-Regular",
                  },
                ]}
              >
                {t("gdpr.account.deleteDescription")}
              </Text>
            </View>
            <Text
              style={[
                styles.actionButton,
                { color: "#EF4444", fontFamily: "Onest-Medium" },
              ]}
            >
              {isDeleting
                ? t("gdpr.account.deleting")
                : t("gdpr.account.deleteButton")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
  },
  actionTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 13,
  },
  actionButton: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
  },
});
