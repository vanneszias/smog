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

export const styles = {
  body: {
    backgroundColor: color.background,
    fontFamily: FONT,
    margin: "0",
    padding: "0",
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
    margin: `${px(spacing["8"])} auto`,
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
  link: { color: color.primaryStrong, wordBreak: "break-all" },
  text: {
    color: color.foreground,
    fontSize: px(fontSize.body.size),
    lineHeight: px(fontSize.body.lineHeight),
  },
} satisfies Record<string, CSSProperties>;
