import {
  isHiddenFromAccessibility,
  screen,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";

/** The target size WCAG 2.2 (2.5.8, and the platform guidelines) ask for, in pt. */
const MIN_TARGET = 44;

/** A host element of the rendered tree (what `screen.container` holds). */
type Host = ReturnType<typeof screen.container.queryAll>[number];

interface Style {
  height?: number;
  minHeight?: number;
  minWidth?: number;
  width?: number;
}

export interface A11yFinding {
  /** What is wrong, one sentence. */
  problem: string;
  /** Where: the element type, its role and its accessible name, as far as known. */
  where: string;
}

/** Text of a host element: every string child of it and its descendants. */
function textOf(host: Host): string {
  return host.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("")
    .trim();
}

function nameOf(host: Host): string {
  const { props } = host;
  const label = props.accessibilityLabel ?? props["aria-label"];
  if (typeof label === "string" && label.trim() !== "") {
    return label.trim();
  }
  return textOf(host);
}

function roleOf(host: Host): string | undefined {
  const role = host.props.accessibilityRole ?? host.props.role;
  return typeof role === "string" && role !== "" ? role : undefined;
}

function describe(host: Host): string {
  return `${host.type}[${roleOf(host) ?? "no role"}] "${nameOf(host)}"`;
}

/** The pt of slop `hitSlop` adds to each side of one axis. */
function slopOf(hitSlop: unknown, axis: "horizontal" | "vertical"): number {
  if (typeof hitSlop === "number") {
    return hitSlop * 2;
  }
  if (typeof hitSlop !== "object" || hitSlop === null) {
    return 0;
  }
  const slop = hitSlop as Record<string, number | undefined>;
  return axis === "vertical"
    ? (slop.top ?? 0) + (slop.bottom ?? 0)
    : (slop.left ?? 0) + (slop.right ?? 0);
}

/** Whether `host` is something a finger or a switch can operate. */
export function isInteractive(host: Host): boolean {
  return host.props.focusable === true || host.type === "TextInput";
}

/**
 * The interactive host elements on screen that a screen reader can reach
 * (hidden ones, such as a sheet's backdrop, are left out).
 */
export function interactiveHosts(root: Host = screen.container): Host[] {
  return root
    .queryAll(isInteractive)
    .filter((host) => !isHiddenFromAccessibility(host));
}

/**
 * Whether the host's hit area (its own size plus `hitSlop`) is at least 44 pt
 * high, and 44 pt wide when its width is known. A width the style does not
 * set is the content's or the parent's, which Jest has no layout for: a
 * control that is only an icon must therefore set one.
 */
function targetFindings(host: Host, iconOnly: boolean): string[] {
  const style = (StyleSheet.flatten(host.props.style) ?? {}) as Style;
  const height = Math.max(style.height ?? 0, style.minHeight ?? 0);
  const width = Math.max(style.width ?? 0, style.minWidth ?? 0);
  const findings: string[] = [];
  if (height + slopOf(host.props.hitSlop, "vertical") < MIN_TARGET) {
    findings.push(
      `hit area is ${height + slopOf(host.props.hitSlop, "vertical")} pt high (needs ${MIN_TARGET})`
    );
  }
  if (width === 0 && iconOnly) {
    findings.push("an icon-only control must set its width");
  } else if (
    width > 0 &&
    width + slopOf(host.props.hitSlop, "horizontal") < MIN_TARGET
  ) {
    findings.push(
      `hit area is ${width + slopOf(host.props.hitSlop, "horizontal")} pt wide (needs ${MIN_TARGET})`
    );
  }
  return findings;
}

export interface AuditOptions {
  /**
   * Controls whose size the audit does not hold to 44 pt, by accessible
   * name, each with the reason (an inline link in a sentence: WCAG 2.5.8's
   * inline exception).
   */
  exemptTargets?: Record<string, string>;
  /**
   * Check the hit areas (default). Off where the runner has no compiled
   * Tailwind to turn `className` into a style (the app's route tests): the
   * kit's own tests hold every component to 44 pt, and the app's source test
   * holds the app's few raw `Pressable`s.
   */
  targets?: boolean;
}

/**
 * What is wrong with the interactive elements now on screen: every one needs
 * an accessibilityRole and an accessible name (its label, or its text), and a
 * hit area of at least 44 x 44 pt. A text field needs a name but no role.
 */
export function auditInteractive(options: AuditOptions = {}): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const exempt = options.exemptTargets ?? {};
  for (const host of interactiveHosts()) {
    const where = describe(host);
    const field = host.type === "TextInput";
    if (!(field || roleOf(host))) {
      findings.push({ problem: "has no accessibilityRole", where });
    }
    const labelled =
      nameOf(host) !== "" ||
      typeof host.props.accessibilityLabelledBy === "string";
    if (!labelled) {
      findings.push({ problem: "has no accessible name", where });
    }
    if (field || options.targets === false || nameOf(host) in exempt) {
      continue;
    }
    const iconOnly = textOf(host) === "";
    for (const problem of targetFindings(host, iconOnly)) {
      findings.push({ problem, where });
    }
  }
  return findings;
}

/** `auditInteractive` as lines, for `expect(...).toEqual([])`. */
export function formatFindings(findings: readonly A11yFinding[]): string[] {
  return findings.map((finding) => `${finding.where}: ${finding.problem}`);
}
