import { FONT_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import type React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen
        options={{
          title: "Developer Tools",
          headerStyle: { backgroundColor: theme.primary },
          headerTintColor: theme.background,
          headerTitleStyle: { fontWeight: "700" },
        }}
      />

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Cache Management
        </Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.label, { color: theme.text }]}>
            Cache Size:{" "}
            <Text style={{ fontWeight: "bold" }}>
              {cacheStats ? cacheStats.size : "Loading..."}
            </Text>
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            DB Gestures:{" "}
            <Text style={{ fontWeight: "bold" }}>
              {dbStats ? dbStats.gestureCount : "Loading..."}
            </Text>
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            Last Sync:{" "}
            <Text style={{ fontSize: FONT_SIZE.sm }}>
              {dbStats?.lastSync ? dbStats.lastSync.toLocaleString() : "Never"}
            </Text>
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            Keys:{" "}
            <Text style={{ fontSize: FONT_SIZE.sm }}>
              {cacheStats ? cacheStats.keys.join(", ") : "Loading..."}
            </Text>
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isRefreshing}
            onPress={handleRefreshData}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            {isRefreshing ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.background }]}>
                Refresh Data (Clear Cache)
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isCheckingUpdates}
            onPress={handleCheckForUpdates}
            style={[
              styles.button,
              { backgroundColor: theme.accent || theme.primary },
            ]}
          >
            {isCheckingUpdates ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.background }]}>
                Check for Updates
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text
          style={[
            styles.sectionTitle,
            { color: theme.text, marginTop: SPACING.xl },
          ]}
        >
          Logs
        </Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text
            style={[
              styles.label,
              {
                color: theme.text,
                fontWeight: "700",
                marginBottom: SPACING.sm,
              },
            ]}
          >
            Log Actions
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isExportingLogs}
            onPress={handleExportLogs}
            style={[
              styles.button,
              {
                backgroundColor: theme.accent || theme.primary,
                marginBottom: SPACING.sm,
              },
            ]}
          >
            {isExportingLogs ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.background }]}>
                Export Logs
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isSavingLogs}
            onPress={handleSaveLogsToDevice}
            style={[
              styles.button,
              {
                borderWidth: 1,
                borderColor: theme.primary,
                backgroundColor: theme.card,
                marginBottom: SPACING.sm,
              },
            ]}
          >
            {isSavingLogs ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.primary }]}>
                Save Logs to Device
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleClearLogs}
            style={[
              styles.button,
              { backgroundColor: theme.primary, marginBottom: SPACING.sm },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.background }]}>
              Clear Logs
            </Text>
          </TouchableOpacity>
        </View>
        <View
          style={[styles.card, { backgroundColor: theme.card, minHeight: 200 }]}
        >
          <Text
            style={[
              styles.label,
              {
                color: theme.text,
                fontWeight: "700",
                marginBottom: SPACING.sm,
              },
            ]}
          >
            Log Output
          </Text>
          <ScrollView style={styles.logContainer}>
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
      </ScrollView>
      <ToastContainer />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "700",
    marginBottom: SPACING.sm,
  },
  card: {
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.sm,
  },
  button: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  buttonText: {
    fontWeight: "700",
    fontSize: FONT_SIZE.md,
  },
  logContainer: {
    maxHeight: 300,
  },
});

export default DeveloperToolsScreen;
