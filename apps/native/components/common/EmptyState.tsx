import { FONT_SIZE, SPACING } from "@smog/styles";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface EmptyStateProps {
  message: string;
  recentSearches?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message, recentSearches }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
      {recentSearches}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  message: {
    fontSize: FONT_SIZE.md,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
});

export default EmptyState;
