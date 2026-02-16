import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@smog/convex";
import { FONT_SIZE, FONT_WEIGHT, ICON_SIZE, SPACING } from "@smog/styles";
import { useMutation, useQuery } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BaseButton from "@/components/common/BaseButton";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";
import {
  disableAnalytics,
  enableAnalytics,
  isAnalyticsActive,
} from "@/services/analyticsService";

export default function AccountSettingsScreen() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const router = useRouter();
  const { triggerHaptic } = useNativeInteractions();

  const _consentStatus = useQuery(api.gdpr.getConsentStatus);
  const exportData = useQuery(api.gdpr.exportUserData);
  const deleteAccount = useMutation(api.gdpr.deleteUserAccount);
  const updateConsent = useMutation(api.gdpr.updateConsent);

  const [analyticsEnabled, setAnalyticsEnabled] = useState(isAnalyticsActive());
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleAnalyticsToggle = useCallback(
    async (value: boolean) => {
      try {
        triggerHaptic("light");
        setAnalyticsEnabled(value);

        // Update analytics locally
        if (value) {
          await enableAnalytics();
        } else {
          await disableAnalytics();
        }

        // Try to sync with server if authenticated
        if (user) {
          try {
            await updateConsent({ analyticsConsent: value });
          } catch (syncError) {
            // Log but don't fail the entire operation if server sync fails
            console.warn(
              "[AccountSettings] Failed to sync consent to server:",
              syncError
            );
          }
        }

        showToast({
          type: "success",
          message: t("gdpr.consent.updated"),
        });
      } catch (error) {
        console.error(
          "[AccountSettings] Failed to update analytics consent:",
          error
        );
        showToast({
          type: "error",
          message: t("gdpr.consent.failed"),
        });
        setAnalyticsEnabled(!value);
      }
    },
    [user, updateConsent, triggerHaptic, showToast, t]
  );

  const handleExportData = useCallback(async () => {
    try {
      triggerHaptic("medium");
      setIsExporting(true);

      if (!exportData) {
        showToast({
          type: "error",
          message: t("gdpr.account.exportFailed"),
        });
        return;
      }

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileName = `smog-data-export-${new Date().toISOString()}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({
          message: jsonString,
          title: fileName,
        });
      }

      showToast({
        type: "success",
        message: t("gdpr.account.exportSuccess"),
      });
    } catch (error) {
      console.error("[AccountSettings] Failed to export data:", error);
      showToast({
        type: "error",
        message: t("gdpr.account.exportFailed"),
      });
    } finally {
      setIsExporting(false);
    }
  }, [exportData, triggerHaptic, showToast, t]);

  const handleSignOutPress = useCallback(() => {
    triggerHaptic("medium");
    Alert.alert(
      t("account.logoutConfirmTitle"),
      t("account.logoutConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.logout"),
          onPress: async () => {
            try {
              setIsSigningOut(true);
              triggerHaptic("success");
              await signOut();
              showToast({
                type: "success",
                message: "Successfully signed out",
              });
              router.replace("/welcome");
            } catch (error) {
              console.error("[AccountSettings] Failed to sign out:", error);
              showToast({
                type: "error",
                message: t("account.logoutError"),
              });
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ]
    );
  }, [triggerHaptic, signOut, router, showToast, t]);

  const handleDeletePress = useCallback(() => {
    triggerHaptic("heavy");
    Alert.alert(
      t("gdpr.account.deleteConfirmTitle"),
      t("gdpr.account.deleteConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("gdpr.account.deleteConfirmButton"),
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);

              await deleteAccount({ confirmDelete: true });

              await AsyncStorage.multiRemove([
                "@smog_gdpr_consent",
                "@smog_analytics_consent",
                "@smog_consent_version",
                "@smog_consent_date",
                "@smog_user",
                "@smog_guest_id",
                "@smog_guest_mode",
              ]);

              await signOut();
              triggerHaptic("success");

              showToast({
                type: "success",
                message: t("gdpr.account.deleteSuccess"),
              });

              router.replace("/welcome");
            } catch (error) {
              console.error(
                "[AccountSettings] Failed to delete account:",
                error
              );
              showToast({
                type: "error",
                message: t("gdpr.account.deleteFailed"),
              });
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }, [triggerHaptic, deleteAccount, signOut, router, showToast, t]);

  const nativeHeaderOptions =
    Platform.OS === "ios"
      ? {
          headerTransparent: true,
          headerBlurEffect: "systemChromeMaterial" as const,
          headerShadowVisible: false,
          headerTintColor: theme.primary,
          headerTitleStyle: {
            fontWeight: "600" as const,
            color: theme.text,
          },
        }
      : {
          headerStyle: {
            backgroundColor: theme.primary,
          },
          headerTintColor: theme.background,
          headerTitleStyle: {
            fontWeight: FONT_WEIGHT.bold,
          },
        };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen
          options={{
            title: t("account.title"),
            headerBackButtonDisplayMode: "minimal",
            ...nativeHeaderOptions,
          }}
        />
        <View style={styles.emptyContainer}>
          <Ionicons
            color={theme.textLight}
            name="person-outline"
            size={ICON_SIZE.xl * 2}
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {t("account.guestMode")}
          </Text>
          <Text style={[styles.emptyDescription, { color: theme.textLight }]}>
            {t("account.guestModeDescription")}
          </Text>
          <BaseButton
            onPress={() => router.replace("/welcome")}
            size="large"
            style={styles.signInButton}
            title={t("auth.welcome.signInSignUp")}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: t("account.title"),
          headerBackButtonDisplayMode: "minimal",
          ...nativeHeaderOptions,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Account Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("account.accountInfo")}
          </Text>
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons
              color={theme.primary}
              name="mail-outline"
              size={ICON_SIZE.md}
            />
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: theme.textLight }]}>
                {t("auth.email")}
              </Text>
              <Text style={[styles.settingValue, { color: theme.text }]}>
                {user.email || t("account.unknownUser")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("gdpr.account.analytics")}
          </Text>
          <View
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons
              color={theme.text}
              name="analytics-outline"
              size={ICON_SIZE.md}
            />
            <View style={styles.settingContent}>
              <Text style={[styles.settingValue, { color: theme.text }]}>
                {t("gdpr.consent.analyticsTitle")}
              </Text>
              <Text
                style={[styles.settingDescription, { color: theme.textLight }]}
              >
                {t("gdpr.account.analyticsDescription")}
              </Text>
            </View>
            <Switch
              ios_backgroundColor={theme.border}
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

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("gdpr.account.manageData")}
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isExporting || !exportData}
            onPress={handleExportData}
            style={[
              styles.settingRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons
              color={theme.text}
              name="download-outline"
              size={ICON_SIZE.md}
            />
            <View style={styles.settingContent}>
              <Text style={[styles.settingValue, { color: theme.text }]}>
                {t("gdpr.account.exportData")}
              </Text>
              <Text
                style={[styles.settingDescription, { color: theme.textLight }]}
              >
                {t("gdpr.account.exportDescription")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("account.dangerZone")}
          </Text>

          <BaseButton
            disabled={isSigningOut}
            loading={isSigningOut}
            onPress={handleSignOutPress}
            size="large"
            style={styles.actionButton}
            textStyle={{ color: theme.text }}
            title={isSigningOut ? t("account.loggingOut") : t("account.logout")}
            variant="outline"
          />

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isDeleting}
            onPress={handleDeletePress}
            style={[
              styles.settingRow,
              styles.deleteRow,
              { backgroundColor: theme.card },
            ]}
          >
            <Ionicons
              color="#EF4444"
              name="trash-outline"
              size={ICON_SIZE.md}
            />
            <View style={styles.settingContent}>
              <Text style={[styles.settingValue, { color: "#EF4444" }]}>
                {t("gdpr.account.deleteAccount")}
              </Text>
              <Text
                style={[styles.settingDescription, { color: theme.textLight }]}
              >
                {t("gdpr.account.deleteDescription")}
              </Text>
            </View>
            <Ionicons
              color="#EF4444"
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Confirmation dialogs now use native Alert.alert() — see handleSignOutPress and handleDeletePress */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.md,
    textAlign: "center",
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  signInButton: {
    minWidth: 200,
  },
  section: {
    marginTop: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 60,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: FONT_SIZE.sm,
    marginBottom: 2,
  },
  settingValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  settingDescription: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: 4,
  },
  actionButton: {
    marginBottom: SPACING.md,
  },
  deleteRow: {
    borderColor: "#FEE2E2",
    borderWidth: 1,
  },
});
