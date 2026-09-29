import { colors } from "./colors";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  accent: string;
  background: string;
  border: string;
  card: string;
  error: string;
  liked: string;
  primary: string;
  secondary: string;
  statusBar: "light" | "dark";
  text: string;
  textLight: string;
  warning: string;
}

export const themes = {
  dark: {
    accent: "#f8a93c",
    background: "#121212",
    border: "#444444",
    card: "#1e1e1e",
    error: "#FF453A",
    liked: "#FF3B7D",
    primary: "#00a077",
    secondary: "#5a8e5c",
    statusBar: "light" as const,
    text: "#ffffff",
    textLight: "#cccccc",
    warning: "#F5D916", // Slightly brighter yellow for dark theme
  },
  light: {
    accent: colors.accent,
    background: "#ffffff",
    border: "#dddddd",
    card: "#f8f8f8",
    error: "#FF3B30",
    liked: "#FF3B7D",
    primary: colors.primary,
    secondary: colors.secondary,
    statusBar: "dark" as const,
    text: "#333333",
    textLight: "#666666",
    warning: colors.warning,
  },
} as const;
