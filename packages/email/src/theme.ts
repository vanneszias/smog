/**
 * Email styles from the `@smog/styles` tokens. Email clients have no CSS
 * variables and no reliable dark mode, so the light theme is resolved to
 * literal values here. The one non-token value is the 560 px container, the
 * usual email body width.
 */
import { tokens } from "@smog/styles/tokens";
import type { CSSProperties } from "react";

const { fontFamily, fontSize, fontWeight, radius, spacing } = tokens;
const color = tokens.color.light;

const px = (value: number): string => `${value}px`;

const EMAIL_WIDTH = 560;
const FONT = fontFamily.web.join(", ");

/**
 * The header logo (`@smog/brand` renders `/brand/email-logo.png` at 2x,
 * 369 × 80): shown 40 px tall. Email clients do not show SVG.
 */
export const EMAIL_LOGO = {
  height: 40,
  path: "/brand/email-logo.png",
  width: 185,
} as const;

export const styles = {
  body: {
    backgroundColor: color.background,
    fontFamily: FONT,
    margin: "0",
    padding: "0",
  },
  /** A tinted box (details, next steps, the invoice). */
  box: {
    backgroundColor: color.primarySubtle,
    borderRadius: px(radius.md),
    margin: `${px(spacing["4"])} 0`,
    padding: `${px(spacing["4"])} ${px(spacing["5"])}`,
  },
  boxTitle: {
    color: color.primaryStrong,
    fontSize: px(fontSize["body-sm"].size),
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.04em",
    lineHeight: px(fontSize["body-sm"].lineHeight),
    margin: `0 0 ${px(spacing["2"])}`,
    textTransform: "uppercase",
  },
  brand: {
    color: color.primaryForeground,
    fontSize: px(fontSize["title-3"].size),
    fontWeight: fontWeight.semibold,
    margin: "0",
    textAlign: "center",
  },
  button: {
    backgroundColor: color.primary,
    borderRadius: px(radius.md),
    color: color.primaryForeground,
    display: "inline-block",
    fontSize: px(fontSize.body.size),
    fontWeight: fontWeight.semibold,
    padding: `${px(spacing["3"])} ${px(spacing["6"])}`,
    textDecoration: "none",
  },
  code: {
    backgroundColor: color.surfaceSunken,
    borderRadius: px(radius.md),
    color: color.foreground,
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: px(fontSize["title-1"].size),
    fontWeight: fontWeight.semibold,
    letterSpacing: px(spacing["2"]),
    margin: `${px(spacing["4"])} 0`,
    padding: px(spacing["4"]),
    textAlign: "center",
  },
  container: {
    backgroundColor: color.surface,
    border: `1px solid ${color.border}`,
    borderRadius: px(radius.lg),
    margin: `${px(spacing["8"])} auto ${px(spacing["4"])}`,
    maxWidth: px(EMAIL_WIDTH),
    overflow: "hidden",
  },
  content: { padding: px(spacing["8"]) },
  footer: {
    color: color.foregroundMuted,
    fontSize: px(fontSize["body-sm"].size),
    lineHeight: px(fontSize["body-sm"].lineHeight),
  },
  header: {
    backgroundColor: color.primary,
    padding: `${px(spacing["6"])} ${px(spacing["8"])}`,
  },
  heading: {
    color: color.foreground,
    fontSize: px(fontSize["title-2"].size),
    fontWeight: fontWeight.semibold,
    lineHeight: px(fontSize["title-2"].lineHeight),
    margin: `0 0 ${px(spacing["4"])}`,
  },
  hr: { borderColor: color.border, margin: `${px(spacing["6"])} 0` },
  /** The organisation's footer under the card. */
  legal: {
    color: color.foregroundMuted,
    fontSize: px(fontSize.caption.size),
    lineHeight: px(fontSize.caption.lineHeight),
    margin: `${px(spacing["1"])} 0`,
    textAlign: "center",
  },
  legalSection: {
    margin: `0 auto ${px(spacing["8"])}`,
    maxWidth: px(EMAIL_WIDTH),
    padding: `0 ${px(spacing["4"])}`,
  },
  /** One line of a details value that lists several (the gestures). */
  lineBlock: { display: "block" },
  link: { color: color.primaryStrong, wordBreak: "break-all" },
  /** The logo in the header bar, 40 px tall. */
  /**
   * With images blocked (Outlook's default) the alt text shows instead: in
   * the brand's white and size, not the client's dark default on green.
   */
  logo: {
    border: "0",
    color: color.primaryForeground,
    display: "block",
    fontSize: px(fontSize["title-3"].size),
    fontWeight: fontWeight.semibold,
    margin: "0 auto",
  },
  /** The error text in the render-failed email. */
  pre: {
    backgroundColor: color.surfaceSunken,
    borderRadius: px(radius.md),
    color: color.foreground,
    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
    fontSize: px(fontSize["body-sm"].size),
    lineHeight: px(fontSize["body-sm"].lineHeight),
    margin: `${px(spacing["2"])} 0 ${px(spacing["4"])}`,
    padding: px(spacing["3"]),
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  /** A label / value row in a box. */
  rowLabel: {
    color: color.foregroundMuted,
    fontSize: px(fontSize["body-sm"].size),
    lineHeight: px(fontSize["body-sm"].lineHeight),
    margin: `${px(spacing["1"])} 0`,
    paddingRight: px(spacing["4"]),
    verticalAlign: "top",
    width: "40%",
  },
  rowValue: {
    color: color.foreground,
    fontSize: px(fontSize["body-sm"].size),
    fontWeight: fontWeight.semibold,
    lineHeight: px(fontSize["body-sm"].lineHeight),
    margin: `${px(spacing["1"])} 0`,
    verticalAlign: "top",
    wordBreak: "break-word",
  },
  /** A numbered step or a list item in a box. */
  step: {
    color: color.foreground,
    fontSize: px(fontSize.body.size),
    lineHeight: px(fontSize.body.lineHeight),
    margin: `${px(spacing["1"])} 0`,
  },
  text: {
    color: color.foreground,
    fontSize: px(fontSize.body.size),
    lineHeight: px(fontSize.body.lineHeight),
  },
} satisfies Record<string, CSSProperties>;
