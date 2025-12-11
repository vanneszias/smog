import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ThemeColors, type ThemeMode, themes } from "@smog/styles";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

type ThemeContextType = {
  theme: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: themes.light,
  themeMode: "system",
  setThemeMode: () => {
    /* noop */
  },
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme() || "light";
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    // Load saved theme preference
    AsyncStorage.getItem("themeMode").then((savedTheme) => {
      if (
        savedTheme &&
        (savedTheme === "light" ||
          savedTheme === "dark" ||
          savedTheme === "system")
      ) {
        setThemeModeState(savedTheme as ThemeMode);
      }
    });
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem("themeMode", mode);
  };

  // Determine the actual theme to use
  const theme =
    themeMode === "system"
      ? themes[systemColorScheme as "light" | "dark"]
      : themes[themeMode as "light" | "dark"];

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
