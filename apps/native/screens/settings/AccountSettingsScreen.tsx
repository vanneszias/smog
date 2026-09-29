import Ionicons from "@expo/vector-icons/Ionicons";
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
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BaseButton from "@/components/common/BaseButton";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import { useNativeInteractions } from "@/hooks/useNativeInteractions";
import logger from "@/utils/logger";

export default function AccountSettingsScreen() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { triggerHaptic } = useNativeInteractions();

  const exportData = useQuery(api.gdpr.exportUserData);
  const deleteAccount = useMutation(api.gdpr.deleteUserAccount);

  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleExportData = useCallback(async () => {
    try {
      triggerHaptic("medium");
      setIsExporting(true);

      if (!exportData) {
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
    } catch (error) {
      logger.error("[AccountSettings] Failed to export data:", error);
    } finally {
      setIsExporting(false);
    }
  }, [exportData, triggerHaptic]);

  const handleSignOutPress = useCallback(() => {
    triggerHaptic("medium");
    Alert.alert(
      t("account.logoutConfirmTitle"),
      t("account.logoutConfirmMessage"),
      [
        { style: "cancel", text: t("common.cancel") },
        {
          onPress: async () => {
            try {
              setIsSigningOut(true);
              triggerHaptic("success");
              await signOut();
              router.replace("/welcome");
            } catch (error) {
              logger.error("[AccountSettings] Failed to sign out:", error);
            } finally {
              setIsSigningOut(false);
            }
          },
          text: t("account.logout"),
        },
      ]
    );
  }, [triggerHaptic, signOut, router, t]);

  const handleDeletePress = useCallback(() => {
    triggerHaptic("heavy");
    Alert.alert(
      t("gdpr.account.deleteConfirmTitle"),
      t("gdpr.account.deleteConfirmMessage"),
      [
        { style: "cancel", text: t("common.cancel") },
        {
          onPress: async () => {
            try {
              setIsDeleting(true);

              await deleteAccount({ confirmDelete: true });

              await Promise.all(
                ["@smog_user", "@smog_guest_id", "@smog_guest_mode"].map((k) =>
                  AsyncStorage.removeItem(k)
                )
              );

              await signOut();
              triggerHaptic("success");

              router.replace("/welcome");
            } catch (error) {
              logger.error(
                "[AccountSettings] Failed to delete account:",
                error
              );
              setIsDeleting(false);
            }
          },
          style: "destructive",
          text: t("gdpr.account.deleteConfirmButton"),
        },
      ]
    );
  }, [triggerHaptic, deleteAccount, signOut, router, t]);

  const handleSignInPress = useCallback(() => {
    router.replace("/welcome");
  }, [router]);

  const nativeHeaderOptions =
    Platform.OS === "ios"
      ? {
          headerBlurEffect: "systemChromeMaterial" as const,
          headerShadowVisible: false,
          headerTintColor: theme.primary,
          headerTitleStyle: {
            color: theme.text,
            fontWeight: "600" as const,
          },
          headerTransparent: true,
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
            headerBackButtonDisplayMode: "minimal",
            title: t("account.title"),
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
            onPress={handleSignInPress}
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
          headerBackButtonDisplayMode: "minimal",
          title: t("account.title"),
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
  actionButton: {
    marginBottom: SPACING.md,
  },
  container: {
    flex: 1,
  },
  deleteRow: {
    borderColor: "#FEE2E2",
    borderWidth: 1,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
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
  settingContent: {
    flex: 1,
  },
  settingDescription: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
    marginTop: 4,
  },
  settingLabel: {
    fontSize: FONT_SIZE.sm,
    marginBottom: 2,
  },
  settingRow: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: SPACING.md,
    minHeight: 60,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  settingValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
  signInButton: {
    minWidth: 200,
  },
});
