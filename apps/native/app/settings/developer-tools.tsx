import { FONT_SIZE, SPACING } from "@smog/styles";
import { Stack } from "expo-router";
import type React from "react";
import { useCallback, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ToastContainer from "@/components/ToastContainer";
import { LogContext } from "@/context/logs/LogProvider";
import { useTheme } from "@/context/ThemeContext";
import { gestureService } from "@/services/gestureService";

const DeveloperToolsScreen: React.FC = () => {
  const { theme } = useTheme();
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    keys: string[];
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { logs, clearLogs } = useContext(LogContext);

  const fetchCacheStats = useCallback(() => {
    gestureService
      .getCacheStats()
      .then((stats) => setCacheStats(stats))
      .catch(() => {
        setCacheStats(null);
        Alert.alert("Error", "Failed to fetch cache stats.");
      });
  }, []);

  useEffect(() => {
    fetchCacheStats();
  }, [fetchCacheStats]);

  const handleRefreshData = useCallback(() => {
    setIsRefreshing(true);
    setIsRefreshing(true);
    gestureService
      .refreshData()
      .then(async () => {
        await fetchCacheStats();
        Alert.alert("Success", "Data refreshed and cache cleared.");
      })
      .catch(() => {
        Alert.alert("Error", "Failed to refresh data.");
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [fetchCacheStats]);

  const handleClearLogs = () => {
    clearLogs();
  };

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
