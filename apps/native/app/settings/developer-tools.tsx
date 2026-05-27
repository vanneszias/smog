import { Ionicons } from "@expo/vector-icons";
import { FONT_SIZE, ICON_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import type React from "react";
import { useCallback, useContext, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LogContext } from "@/context/logs/LogProvider";
import { useTheme } from "@/context/ThemeContext";
import logger, { exportLogsToFile } from "@/utils/logger";

const DeveloperToolsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { logs, clearLogs, exportLogs } = useContext(LogContext);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isExportingLogs, setIsExportingLogs] = useState(false);

  const handleClearLogs = useCallback(() => {
    clearLogs();
    logger.debug("[DevTools] Logs cleared by user");
  }, [clearLogs]);

  const handleExportLogs = useCallback(async () => {
    const logText = exportLogs();
    if (!logText) {
      Alert.alert("Info", "No logs to export.");
      return;
    }
    setIsExportingLogs(true);
    try {
      const file = await exportLogsToFile();
      await Share.share({
        url: file.uri,
        title: "Smog App Logs",
        message: "Smog App Logs",
      });
      logger.debug(`[DevTools] Logs exported via share: ${file.uri}`);
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to export logs."
      );
    } finally {
      setIsExportingLogs(false);
    }
  }, [exportLogs]);

  const handleSaveLogsToDevice = useCallback(async () => {
    setIsSavingLogs(true);
    try {
      const file = await exportLogsToFile();
      logger.info(`[DevTools] Logs exported to device: ${file.uri}`);
      Alert.alert(
        "Logs Saved",
        `Logs saved to device storage as ${file.name}. You can access it via the Files app.`
      );
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to save logs to device."
      );
    } finally {
      setIsSavingLogs(false);
    }
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: "Developer Tools",
          headerBackButtonDisplayMode: "minimal",
          ...(Platform.OS === "ios"
            ? {
                headerLargeTitle: true,
                headerLargeTitleStyle: { color: theme.text },
                headerTransparent: true,
                headerBlurEffect: "systemChromeMaterial",
                headerShadowVisible: false,
                headerTintColor: theme.primary,
                headerTitleStyle: {
                  fontWeight: "600",
                  color: theme.text,
                },
              }
            : {
                headerStyle: { backgroundColor: theme.primary },
                headerTintColor: theme.background,
                headerTitleStyle: { fontWeight: "700" },
              }),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior={
          Platform.OS === "ios" ? "automatic" : undefined
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Logs */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>Logs</Text>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isExportingLogs}
            onPress={handleExportLogs}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {isExportingLogs ? (
              <ActivityIndicator color={theme.primary} style={styles.rowIcon} />
            ) : (
              <Ionicons
                color={theme.primary}
                name="share"
                size={ICON_SIZE.sm}
                style={styles.rowIcon}
              />
            )}
            <Text style={[styles.actionLabel, { color: theme.primary }]}>
              Export Logs
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isSavingLogs}
            onPress={handleSaveLogsToDevice}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {isSavingLogs ? (
              <ActivityIndicator color={theme.primary} style={styles.rowIcon} />
            ) : (
              <Ionicons
                color={theme.primary}
                name="save"
                size={ICON_SIZE.sm}
                style={styles.rowIcon}
              />
            )}
            <Text style={[styles.actionLabel, { color: theme.primary }]}>
              Save Logs to Device
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleClearLogs}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Ionicons
              color={theme.error ?? "#e53e3e"}
              name="trash"
              size={ICON_SIZE.sm}
              style={styles.rowIcon}
            />
            <Text
              style={[styles.actionLabel, { color: theme.error ?? "#e53e3e" }]}
            >
              Clear Logs
            </Text>
          </TouchableOpacity>
        </View>

        {/* Log output */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>
            Log Output
          </Text>
          <View
            style={[
              styles.logCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <ScrollView nestedScrollEnabled style={styles.logScroll}>
              {logs.length === 0 ? (
                <Text style={{ color: theme.textLight, fontStyle: "italic" }}>
                  No logs yet.
                </Text>
              ) : (
                logs.map((log) => (
                  <Text
                    key={log.id}
                    style={{ color: theme.textLight, fontSize: FONT_SIZE.sm }}
                  >
                    {log.message}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sectionContainer: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    marginBottom: SPACING.lg,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    marginBottom: SPACING.sm,
  },
  rowIcon: {
    marginRight: SPACING.sm,
  },
  actionLabel: {
    fontSize: FONT_SIZE.md,
    flex: 1,
  },
  logCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACING.md,
  },
  logScroll: {
    maxHeight: 300,
  },
});

export default DeveloperToolsScreen;
