import { FONT_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import type React from "react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { LogContext } from "@/context/logs/LogProvider";
import { useTheme } from "@/context/ThemeContext";
import { convexSyncService } from "@/services/convexSyncService";
import gestureService from "@/services/gestureService";
import logger from "@/utils/logger";

const DeveloperToolsScreen: React.FC = () => {
  const { theme } = useTheme();
  const {
    logs,
    clearLogs: clearContextLogs,
    exportLogs,
  } = useContext(LogContext);
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    keys: string[];
  } | null>(null);
  const [dbStats, setDbStats] = useState<{
    gestureCount: number;
    lastSync: Date | null;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const logsRef = useRef<string[]>([]);

  useEffect(() => {
    logsRef.current = logs.map((l) => l.message);
  }, [logs]);

  const fetchCacheStats = useCallback(async () => {
    try {
      const stats = await gestureService.getCacheStats();
      setCacheStats(stats);

      // Also fetch database stats
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
    clearContextLogs();
    logger.debug("[DevTools] Logs cleared by user");
  }, [clearContextLogs]);

  const handleExportLogs = useCallback(async () => {
    const logText = exportLogs();
    if (!logText) {
      Alert.alert("Info", "No logs to export.");
      return;
    }
    try {
      await Share.share({ message: logText, title: "Smog App Logs" });
      logger.debug("[DevTools] Logs exported via share");
    } catch {
      Alert.alert("Error", "Failed to export logs.");
    }
  }, [exportLogs]);

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
        `Failed to check for updates: ${error instanceof Error ? error.message : "Unknown error"}`
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
        <View
          style={[styles.card, { backgroundColor: theme.card, minHeight: 200 }]}
        >
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
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleExportLogs}
            style={[
              styles.button,
              {
                backgroundColor: theme.accent || theme.primary,
                marginBottom: SPACING.sm,
              },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.background }]}>
              Export Logs
            </Text>
          </TouchableOpacity>
          <ScrollView style={styles.logContainer}>
            {logs.length === 0 ? (
              <Text style={{ color: theme.textLight, fontStyle: "italic" }}>
                No logs yet.
              </Text>
            ) : (
              logs.map((log) => (
                <Text
                  key={log}
                  style={{ color: theme.textLight, fontSize: FONT_SIZE.sm }}
                >
                  {log}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
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
