import { colors } from "./colors";

export type ThemeMode = "light" | "dark" | "system";

export type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
  warning: string;
  background: string;
  card: string;
  text: string;
  textLight: string;
  border: string;
  error: string;
  liked: string;
  statusBar: "light" | "dark";
};

export const themes = {
  light: {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    warning: colors.warning,
    background: "#ffffff",
    card: "#f8f8f8",
    text: "#333333",
    textLight: "#666666",
    border: "#dddddd",
    error: "#FF3B30",
    liked: "#FF3B7D",
    statusBar: "dark" as const,
  },
  dark: {
    primary: "#00a077",
    secondary: "#5a8e5c",
    accent: "#f8a93c",
    warning: "#F5D916", // Slightly brighter yellow for dark theme
    background: "#121212",
    card: "#1e1e1e",
    text: "#ffffff",
    textLight: "#cccccc",
    border: "#444444",
    error: "#FF453A",
    liked: "#FF3B7D",
    statusBar: "light" as const,
  },
} as const;

export default themes;
