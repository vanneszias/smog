/**
 * Email styles. The colours are literal brand values for now (the old
 * email palette): `@smog/styles` is not available to this package yet.
 * Follow-up: replace these with `@smog/styles` tokens once it lands.
 */
import type { CSSProperties } from "react";

const COLORS = {
  background: "#ebf4eb",
  border: "#dddddd",
  primary: "#00805f",
  surface: "#ffffff",
  text: "#333333",
  textMuted: "#666666",
} as const;

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const styles = {
  body: {
    backgroundColor: COLORS.background,
    fontFamily: FONT_FAMILY,
    margin: "0",
    padding: "0",
  },
  brand: {
    color: COLORS.surface,
    fontSize: "20px",
    fontWeight: 700,
    margin: "0",
    textAlign: "center",
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: "8px",
    color: COLORS.surface,
    display: "inline-block",
    fontSize: "16px",
    fontWeight: 600,
    padding: "12px 24px",
    textDecoration: "none",
  },
  code: {
    backgroundColor: COLORS.background,
    borderRadius: "8px",
    color: COLORS.text,
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: "32px",
    fontWeight: 700,
    letterSpacing: "8px",
    margin: "16px 0",
    padding: "16px",
    textAlign: "center",
  },
  container: {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "12px",
    margin: "32px auto",
    maxWidth: "560px",
    overflow: "hidden",
  },
  content: { padding: "32px" },
  footer: { color: COLORS.textMuted, fontSize: "13px", lineHeight: "20px" },
  header: { backgroundColor: COLORS.primary, padding: "24px 32px" },
  heading: {
    color: COLORS.text,
    fontSize: "24px",
    fontWeight: 700,
    margin: "0 0 16px",
  },
  hr: { borderColor: COLORS.border, margin: "24px 0" },
  link: { color: COLORS.primary, wordBreak: "break-all" },
  text: { color: COLORS.text, fontSize: "16px", lineHeight: "24px" },
} satisfies Record<string, CSSProperties>;
