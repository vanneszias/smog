import { colors, FONT_SIZE, FONT_WEIGHT, SPACING } from "@smog/styles";
import { StyleSheet } from "react-native";

export const typography = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: 24,
  },
  bodySmall: {
    color: colors.textLight,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    lineHeight: 20,
  },
  buttonText: {
    color: colors.background,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    textAlign: "center",
  },
  caption: {
    color: colors.textLight,
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.regular,
  },
  emptyState: {
    color: colors.textLight,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    marginTop: SPACING.xl,
    textAlign: "center",
  },
  link: {
    color: colors.primary,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.regular,
    textDecorationLine: "underline",
  },
  subtitle: {
    color: colors.text,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  title: {
    color: colors.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.sm,
  },
});
