/**
 * Shared email styles — SMOG brand design tokens
 *
 * All email templates import from here so that brand colors, typography,
 * and spacing stay consistent and easy to maintain.
 *
 * Brand palette source: packages/styles/src/colors.ts
 */
import type * as React from "react";

// =============================================================================
// Brand tokens (inlined to avoid a runtime workspace dep in the server)
// =============================================================================

const BRAND = {
  primary: "#00805F", // Dark green — main brand color
  primaryDark: "#006B4F", // Darker green for hover states
  secondary: "#97C699", // Light green
  secondaryLight: "#ebf4eb", // Very light green — page background
  accent: "#EE971C", // Orange
  text: "#333333", // Dark gray
  textLight: "#666666", // Secondary text
  textMuted: "#8898aa", // Footer / muted text
  border: "#dddddd", // Borders
  white: "#ffffff",
} as const;

// =============================================================================
// Layout
// =============================================================================

export const body: React.CSSProperties = {
  backgroundColor: BRAND.secondaryLight,
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: "0",
  padding: "0",
};

export const container: React.CSSProperties = {
  backgroundColor: BRAND.white,
  margin: "0 auto",
  padding: "0",
  maxWidth: "560px",
  borderRadius: "12px",
  marginTop: "32px",
  marginBottom: "32px",
  border: `1px solid ${BRAND.border}`,
  overflow: "hidden",
};

// =============================================================================
// Header (logo bar)
// =============================================================================

export const header: React.CSSProperties = {
  backgroundColor: BRAND.primary,
  padding: "24px 32px",
  textAlign: "center" as const,
};

export const logoImg: React.CSSProperties = {
  height: "40px",
  width: "auto",
};

// =============================================================================
// Content area
// =============================================================================

export const content: React.CSSProperties = {
  padding: "32px 32px 24px",
};

// =============================================================================
// Typography
// =============================================================================

export const h1: React.CSSProperties = {
  color: BRAND.text,
  fontSize: "22px",
  fontWeight: "700",
  margin: "0 0 20px",
  lineHeight: "1.3",
};

export const text: React.CSSProperties = {
  color: BRAND.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

export const textSmall: React.CSSProperties = {
  color: BRAND.textLight,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};

// =============================================================================
// CTA Button
// =============================================================================

export const buttonSection: React.CSSProperties = {
  margin: "24px 0",
};

export const button: React.CSSProperties = {
  backgroundColor: BRAND.primary,
  borderRadius: "8px",
  color: BRAND.white,
  fontSize: "15px",
  fontWeight: "600",
  padding: "12px 28px",
  textDecoration: "none",
  display: "inline-block",
};

// =============================================================================
// Info / highlight boxes
// =============================================================================

export const infoBox: React.CSSProperties = {
  backgroundColor: BRAND.secondaryLight,
  border: `1px solid ${BRAND.secondary}`,
  borderRadius: "8px",
  padding: "18px 22px",
  margin: "20px 0",
};

export const receiptBox: React.CSSProperties = {
  backgroundColor: BRAND.secondaryLight,
  border: `1px solid ${BRAND.secondary}`,
  borderRadius: "8px",
  padding: "14px 20px",
  margin: "20px 0",
};

// =============================================================================
// Receipt / detail table rows
// =============================================================================

export const detailLabel: React.CSSProperties = {
  color: BRAND.textLight,
  fontSize: "14px",
  padding: "5px 0",
  width: "45%",
};

export const detailValue: React.CSSProperties = {
  color: BRAND.text,
  fontSize: "14px",
  fontWeight: "600",
  padding: "5px 0",
};

// =============================================================================
// Divider & footer
// =============================================================================

export const hr: React.CSSProperties = {
  borderColor: BRAND.border,
  margin: "24px 0 20px",
};

export const footer: React.CSSProperties = {
  color: BRAND.textMuted,
  fontSize: "12px",
  lineHeight: "19px",
};

// =============================================================================
// Email footer bar
// =============================================================================

export const footerBar: React.CSSProperties = {
  backgroundColor: BRAND.secondaryLight,
  borderTop: `1px solid ${BRAND.border}`,
  padding: "18px 32px",
  textAlign: "center" as const,
};

export const footerBarText: React.CSSProperties = {
  color: BRAND.textMuted,
  fontSize: "11px",
  lineHeight: "18px",
  margin: "0",
};
