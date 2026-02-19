import { Ionicons } from "@expo/vector-icons";
import { FONT_SIZE, ICON_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import type React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
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
import ToastContainer from "@/components/ToastContainer";
import { LogContext } from "@/context/logs/LogProvider";
import { useTheme } from "@/context/ThemeContext";
import { convexSyncService } from "@/services/convexSyncService";
import gestureService from "@/services/gestureService";
import logger, { exportLogsToFile } from "@/utils/logger";

const DeveloperToolsScreen: React.FC = () => {
  const { theme } = useTheme();
  const { logs, clearLogs, exportLogs } = useContext(LogContext);
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    keys: string[];
  } | null>(null);
  const [dbStats, setDbStats] = useState<{
    gestureCount: number;
    lastSync: Date | null;
    databaseSize: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isExportingLogs, setIsExportingLogs] = useState(false);

  const fetchCacheStats = useCallback(async () => {
    try {
      const stats = await gestureService.getCacheStats();
      setCacheStats(stats);

      const dbStatsData = await gestureService.getDatabaseStats();
      setDbStats(dbStatsData);

      logger.log(`[DevTools] Cache stats: ${stats.size} items`);
      logger.log(
        `[DevTools] DB stats: ${dbStatsData.gestureCount} gestures, last sync: ${dbStatsData.lastSync}`
      );
    } catch (_error) {
      setCacheStats(null);
      setDbStats(null);
      Alert.alert("Error", "Failed to fetch stats.");
    }
  }, []);

  useEffect(() => {
    fetchCacheStats();
  }, [fetchCacheStats]);

  const handleRefreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await gestureService.refreshData();
      await fetchCacheStats();
      Alert.alert("Success", "Data refreshed and cache cleared.");
    } catch {
      Alert.alert("Error", "Failed to refresh data.");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchCacheStats]);

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

  const handleCheckForUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await convexSyncService.checkForUpdates();
      if (result?.success) {
        Alert.alert(
          "Success",
          `Updated ${result.synced} gestures from backend.`
        );
      } else if (result === null) {
        Alert.alert(
          "Info",
          "No updates available - data is already up to date."
        );
      } else {
        Alert.alert("Info", "Check completed but no updates were needed.");
      }
      await fetchCacheStats();
    } catch (error) {
      Alert.alert(
        "Error",
        `Failed to check for updates: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [fetchCacheStats]);

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
        {/* Cache Management */}
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>
            Cache
          </Text>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: theme.textLight }]}>
                Cache size
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {cacheStats ? cacheStats.size : "—"}
              </Text>
            </View>
            <View
              style={[styles.separator, { backgroundColor: theme.border }]}
            />
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: theme.textLight }]}>
                DB gestures
              </Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {dbStats ? dbStats.gestureCount : "—"}
              </Text>
            </View>
            <View
              style={[styles.separator, { backgroundColor: theme.border }]}
            />
            <View style={styles.infoRow}>
              <Text style={[styles.infoKey, { color: theme.textLight }]}>
                Last sync
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.infoValue, { color: theme.text }]}
              >
                {dbStats?.lastSync
                  ? dbStats.lastSync.toLocaleString()
                  : "Never"}
              </Text>
            </View>
            {cacheStats && cacheStats.keys.length > 0 && (
              <>
                <View
                  style={[styles.separator, { backgroundColor: theme.border }]}
                />
                <View style={styles.infoRow}>
                  <Text style={[styles.infoKey, { color: theme.textLight }]}>
                    Keys
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.infoValue,
                      { color: theme.text, flexShrink: 1 },
                    ]}
                  >
                    {cacheStats.keys.join(", ")}
                  </Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isRefreshing}
            onPress={handleRefreshData}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator color={theme.primary} style={styles.rowIcon} />
            ) : (
              <Ionicons
                color={theme.primary}
                name="refresh"
                size={ICON_SIZE.sm}
                style={styles.rowIcon}
              />
            )}
            <Text style={[styles.actionLabel, { color: theme.primary }]}>
              Refresh Data (Clear Cache)
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isCheckingUpdates}
            onPress={handleCheckForUpdates}
            style={[
              styles.actionRow,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            {isCheckingUpdates ? (
              <ActivityIndicator color={theme.primary} style={styles.rowIcon} />
            ) : (
              <Ionicons
                color={theme.primary}
                name="cloud-download"
                size={ICON_SIZE.sm}
                style={styles.rowIcon}
              />
            )}
            <Text style={[styles.actionLabel, { color: theme.primary }]}>
              Check for Updates
            </Text>
            <Ionicons
              color={theme.textLight}
              name="chevron-forward"
              size={ICON_SIZE.sm}
            />
          </TouchableOpacity>
        </View>

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
      <ToastContainer />
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
  infoCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  infoKey: {
    fontSize: FONT_SIZE.md,
    flex: 1,
  },
  infoValue: {
    fontSize: FONT_SIZE.md,
    flex: 2,
    textAlign: "right",
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SPACING.md,
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
