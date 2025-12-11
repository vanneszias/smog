import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import { FONT_SIZE, ICON_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";

const AccountSettingsScreen = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isGuest, isAuthenticated, signOut: authSignOut, user } = useAuth();
  const navigation = useNavigation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t("account.logoutConfirmTitle"),
      t("account.logoutConfirmMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("account.logout"),
          style: "destructive",
          onPress: async () => {
            try {
              setIsLoggingOut(true);

              await authSignOut();

              // Reset navigation stack completely and go to welcome
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [
                    {
                      name: "welcome",
                    },
                  ],
                })
              );
            } catch (error) {
              console.error("Error during logout:", error);
              Alert.alert(t("common.error"), t("account.logoutError"));
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    // TODO: Implement profile editing
    Alert.alert(t("common.comingSoon"), t("account.editProfileComingSoon"));
  };

  const handleChangePassword = () => {
    // TODO: Implement password change
    Alert.alert(t("common.comingSoon"), t("account.changePasswordComingSoon"));
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("account.deleteAccountTitle"),
      t("account.deleteAccountMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("account.deleteAccount"),
          style: "destructive",
          onPress: () => {
            // TODO: Implement account deletion
            Alert.alert(
              t("common.comingSoon"),
              t("account.deleteAccountComingSoon")
            );
          },
        },
      ]
    );
  };

  const userName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : (user?.email ?? t("account.unknownUser"));

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: t("account.title"),
          headerStyle: {
            backgroundColor: theme.primary,
          },
          headerBackButtonDisplayMode: "minimal",
          headerTintColor: theme.background,
          headerTitleStyle: {
            fontWeight: "700",
          },
        }}
      />

      {/* Account Information Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t("account.accountInfo")}
        </Text>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          {isGuest ? (
            <View style={styles.guestInfo}>
              <Ionicons
                color={theme.textLight}
                name="person-outline"
                size={ICON_SIZE.lg}
              />
              <Text style={[styles.guestText, { color: theme.text }]}>
                {t("account.guestMode")}
              </Text>
              <Text style={[styles.guestSubtext, { color: theme.textLight }]}>
                {t("account.guestModeDescription")}
              </Text>
            </View>
          ) : (
            <View style={styles.userInfo}>
              <View style={styles.userDetails}>
                <Text style={[styles.userName, { color: theme.text }]}>
                  {userName}
                </Text>
                <Text style={[styles.userEmail, { color: theme.textLight }]}>
                  {user?.email ?? ""}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleEditProfile}
                style={[styles.editButton, { borderColor: theme.border }]}
              >
                <Ionicons
                  color={theme.primary}
                  name="pencil"
                  size={ICON_SIZE.sm}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Account Actions Section */}
      {isAuthenticated ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t("account.accountActions")}
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleEditProfile}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.actionContent}>
              <Ionicons
                color={theme.text}
                name="person-outline"
                size={ICON_SIZE.md}
              />
              <Text style={[styles.actionText, { color: theme.text }]}>
                {t("account.editProfile")}
              </Text>
            </View>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleChangePassword}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.actionContent}>
              <Ionicons
                color={theme.text}
                name="lock-closed-outline"
                size={ICON_SIZE.md}
              />
              <Text style={[styles.actionText, { color: theme.text }]}>
                {t("account.changePassword")}
              </Text>
            </View>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Danger Zone Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {t("account.dangerZone")}
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          disabled={isLoggingOut}
          onPress={handleLogout}
          style={[
            styles.actionRow,
            styles.logoutRow,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.actionContent}>
            <Ionicons
              color={theme.error || "#FF3B30"}
              name="log-out-outline"
              size={ICON_SIZE.md}
            />
            <Text
              style={[styles.actionText, { color: theme.error || "#FF3B30" }]}
            >
              {isLoggingOut ? t("account.loggingOut") : t("account.logout")}
            </Text>
          </View>
          {isLoggingOut ? (
            <View style={styles.loadingIndicator}>
              <Text style={[styles.loadingText, { color: theme.textLight }]}>
                ...
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {isAuthenticated ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleDeleteAccount}
            style={[
              styles.actionRow,
              styles.deleteRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.actionContent}>
              <Ionicons
                color={theme.error || "#FF3B30"}
                name="trash-outline"
                size={ICON_SIZE.md}
              />
              <Text
                style={[styles.actionText, { color: theme.error || "#FF3B30" }]}
              >
                {t("account.deleteAccount")}
              </Text>
            </View>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  section: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    marginBottom: SPACING.lg,
  },
  infoCard: {
    padding: SPACING.lg,
    borderRadius: 12,
    borderWidth: 1,
  },
  guestInfo: {
    alignItems: "center",
    paddingVertical: SPACING.md,
  },
  guestText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  guestSubtext: {
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
    lineHeight: 20,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    marginBottom: SPACING.xs,
  },
  userEmail: {
    fontSize: FONT_SIZE.sm,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  actionText: {
    fontSize: FONT_SIZE.md,
    marginLeft: SPACING.md,
    fontWeight: "500",
  },
  logoutRow: {
    marginBottom: SPACING.sm,
  },
  deleteRow: {
    marginTop: SPACING.sm,
  },
  loadingIndicator: {
    marginRight: SPACING.sm,
  },
  loadingText: {
    fontSize: FONT_SIZE.sm,
  },
});

export default AccountSettingsScreen;
