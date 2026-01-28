// Re-export shared types
export * from "@smog/types";

// Native-specific types (React Native specific)
import type { TextStyle, ViewStyle } from "react-native";

export interface ComponentStyleProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  buttonStyle?: ViewStyle;
  iconStyle?: ViewStyle;
}
