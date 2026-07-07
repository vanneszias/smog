import { colors, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { StyleSheet } from "react-native";

export const typography = StyleSheet.create({
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: colors.text,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    color: colors.text,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    color: colors.textLight,
    lineHeight: 20,
  },
  caption: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.regular,
    color: colors.textLight,
  },
  buttonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: colors.background,
    textAlign: "center",
  },
  link: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  emptyState: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    color: colors.textLight,
    textAlign: "center",
    marginTop: SPACING.xl,
  },
});
