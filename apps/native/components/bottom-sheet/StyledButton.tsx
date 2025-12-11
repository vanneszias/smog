import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, ICON_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { typography } from "@/utils/typography";

// Use ComponentProps to get the type of valid icon names directly from Ionicons
type IconName = React.ComponentProps<typeof Ionicons>["name"];

interface StyledButtonProps extends TouchableOpacityProps {
  title: string;
  iconName: IconName;
}

const StyledButton: React.FC<StyledButtonProps> = ({
  title,
  iconName,
  style,
  ...rest
}) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.button,
        { backgroundColor: theme.primary },
        SHADOWS.small,
        style, // Allow passing additional styles from the parent
      ]}
      {...rest} // Pass down other TouchableOpacity props like onPress
    >
      <Ionicons color={theme.background} name={iconName} size={ICON_SIZE.sm} />
      <Text style={[typography.buttonText, { color: theme.background }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.xs,
    gap: SPACING.sm,
  },
});

export default StyledButton;
