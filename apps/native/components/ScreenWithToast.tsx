import type React from "react";
import { View, type ViewStyle } from "react-native";
import ToastContainer from "@/components/ToastContainer";

interface ScreenWithToastProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wrapper component that provides consistent toast integration for screens.
 * This ensures toasts appear within the screen content area and adapt to
 * navigation bar visibility changes automatically.
 */
const ScreenWithToast: React.FC<ScreenWithToastProps> = ({
  children,
  style,
}) => (
  <View collapsable={false} style={[{ flex: 1 }, style]}>
    {children}
    <ToastContainer />
  </View>
);

export default ScreenWithToast;
