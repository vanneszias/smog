import { BORDER_RADIUS, FONT_SIZE, SHADOWS, SPACING } from "@smog/styles";
import type React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface BaseInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
}

const BaseInput: React.FC<BaseInputProps> = ({
  label,
  error,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  ...textInputProps
}) => {
  const { theme } = useTheme();

  return (
    <View style={containerStyle}>
      {label ? (
        <Text style={[styles.label, { color: theme.text }, labelStyle]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textLight}
        style={[
          styles.input,
          {
            backgroundColor: theme.card,
            borderColor: error ? theme.error : theme.border,
            color: theme.text,
          },
          SHADOWS.small,
          inputStyle,
        ]}
        {...textInputProps}
      />
      {error ? (
        <Text style={[styles.error, { color: theme.error }, errorStyle]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
    marginBottom: SPACING.xs,
  },
  input: {
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.md,
    borderWidth: 1,
  },
  error: {
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs,
  },
});

export default BaseInput;
