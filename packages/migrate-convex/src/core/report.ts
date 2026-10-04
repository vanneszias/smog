/**
 * The plan report (phase 8 ruling 6): one section per domain, each with
 * its counts and its issues, blockers first. `report.json` is the source;
 * `report.md` is rendered from it, so the two never disagree.
 *
 * A blocker stops `apply` (ruling 14). The report lists ids (Convex `_id`s,
 * which are not personal) and counts; the only text from the data is the
 * overlay offender list (ruling 10), which `personal` marks. The whole
 * report is still treated as personal data: it lives in the gitignored
 * `out/` with the export (global constraints).
 */
import type { Target } from "./target";

/**
 * The report's sections, in order. `export` holds what the reader and
 * the schemas found (unknown tables and fields, malformed rows); the
 * others are the transforms' domains.
 */
export const REPORT_DOMAINS = [
  "export",
  "users",
  "catalog",
  "learning",
  "account",
  "sponsorships",
  "mux",
] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

export const SEVERITIES = ["blocker", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type DetailValue = string | number | boolean | null;

export interface ReportIssue {
  /** A stable camelCase code (`malformedRow`, `overlayTooLong`, …). */
  readonly code: string;
  /** How many rows it concerns, when that differs from `ids.length`. */
  readonly count?: number;
  /** Per-row facts, for the lists the owner acts on (the overlay offenders). */
  readonly details?: readonly Readonly<Record<string, DetailValue>>[];
  /** The legacy ids it concerns (Convex `_id`s or file keys). */
  readonly ids?: readonly string[];
  /** One sentence, with no email, name or token in it. */
  readonly message: string;
  /** Set when `details` quote text from the data (personal data). */
  readonly personal?: boolean;
  readonly severity: Severity;
}

export interface ReportSection {
  readonly counts: Readonly<Record<string, number>>;
  readonly domain: ReportDomain;
  readonly issues: readonly ReportIssue[];
}

export interface ExportSummary {
  /** The content hash of the export's table files (`hashExport`). */
  readonly sha256: string;
  /** Rows per known table (0 for an absent one). */
  readonly tables: Readonly<Record<string, number>>;
  /** Tables that are not among the nine, listed and ignored. */
  readonly unknownTables: readonly string[];
}

export interface Report {
  readonly blockers: number;
  readonly export: ExportSummary;
  /** `--now` as an ISO string. */
  readonly now: string;
  readonly sections: readonly ReportSection[];
  readonly target: Target;
  readonly version: 1;
  readonly warnings: number;
}

/**
 * A problem a transform cannot write around (for example a row `insertRow`
 * refuses): `plan` turns it into a blocker of `domain`, and that
 * transform's statements are left out.
 */
export class PlanBlocker extends Error {
  readonly code: string;
  readonly domain: ReportDomain;
  readonly ids: readonly string[];
  constructor(
    domain: ReportDomain,
    code: string,
    message: string,
    ids: readonly string[] = []
  ) {
    super(message);
    this.name = "PlanBlocker";
    this.code = code;
    this.domain = domain;
    this.ids = ids;
  }

  /** The blocker as a report issue. */
  toIssue(): ReportIssue {
    return {
      code: this.code,
      ids: this.ids,
      message: this.message,
      severity: "blocker",
    };
  }
}

const SEVERITY_RANK: Record<Severity, number> = {
  blocker: 0,
  info: 2,
  warning: 1,
};

/** A section of `domain` (a transform builds one and returns it). */
export function section(
  domain: ReportDomain,
  counts: Readonly<Record<string, number>> = {},
  issues: readonly ReportIssue[] = []
): ReportSection {
  return { counts, domain, issues };
}

function sortedRecord(
  record: Readonly<Record<string, number>>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1))
  );
}

/**
 * One section per domain, in `REPORT_DOMAINS` order: counts with the same
 * key are summed (and sorted by key), issues are ordered blockers, then
 * warnings, then info, keeping their order otherwise.
 */
export function mergeSections(
  sections: readonly ReportSection[]
): ReportSection[] {
  return REPORT_DOMAINS.map((domain) => {
    const counts: Record<string, number> = {};
    const issues: ReportIssue[] = [];
    for (const part of sections) {
      if (part.domain !== domain) {
        continue;
      }
      for (const [key, value] of Object.entries(part.counts)) {
        counts[key] = (counts[key] ?? 0) + value;
      }
      issues.push(...part.issues);
    }
    const ordered = issues
      .map((issue, index) => ({ index, issue }))
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] ||
          a.index - b.index
      )
      .map(({ issue }) => issue);
    return { counts: sortedRecord(counts), domain, issues: ordered };
  });
}

export function buildReport(input: {
  export: ExportSummary;
  now: Date;
  sections: readonly ReportSection[];
  target: Target;
}): Report {
  const sections = mergeSections(input.sections);
  const all = sections.flatMap((part) => part.issues);
  return {
    blockers: all.filter((issue) => issue.severity === "blocker").length,
    export: {
      sha256: input.export.sha256,
      tables: sortedRecord(input.export.tables),
      unknownTables: [...input.export.unknownTables].sort(),
    },
    now: input.now.toISOString(),
    sections,
    target: input.target,
    version: 1,
    warnings: all.filter((issue) => issue.severity === "warning").length,
  };
}

/** `report.json`: two-space JSON with a final newline. */
export function renderReportJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const MARKDOWN_IDS_MAX = 20;
const TRAILING_NEWLINES = /\n+$/;

function markdownCell(value: DetailValue): string {
  if (value === null) {
    return "—";
  }
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function idsLine(ids: readonly string[]): string {
  const shown = ids.slice(0, MARKDOWN_IDS_MAX).map((id) => `\`${id}\``);
  const rest = ids.length - MARKDOWN_IDS_MAX;
  return rest > 0
    ? `${shown.join(", ")} and ${rest} more (report.json lists them all)`
    : shown.join(", ");
}

function issueLines(issue: ReportIssue, domain?: ReportDomain): string[] {
  const where = domain ? `[${domain}] ` : "";
  const count = issue.count === undefined ? "" : ` (${issue.count})`;
  const lines = [
    `- **${issue.severity}** ${where}\`${issue.code}\`${count}: ${issue.message}`,
  ];
  if (issue.ids && issue.ids.length > 0) {
    lines.push(`  - ids: ${idsLine(issue.ids)}`);
  }
  if (issue.details && issue.details.length > 0) {
    const columns = [
      ...new Set(issue.details.flatMap((row) => Object.keys(row))),
    ];
    lines.push(
      "",
      `  | ${columns.join(" | ")} |`,
      `  | ${columns.map(() => "---").join(" | ")} |`,
      ...issue.details.map(
        (row) =>
          `  | ${columns.map((column) => markdownCell(row[column] ?? null)).join(" | ")} |`
      ),
      ""
    );
  }
  return lines;
}

/** `report.md`, rendered from the report: a summary, every blocker, then each section. */
export function renderReportMarkdown(report: Report): string {
  const status =
    report.blockers > 0
      ? `**blocked**: ${report.blockers} blocker(s); \`apply\` refuses this plan`
      : "no blockers";
  const lines = [
    "# Convex import plan",
    "",
    `- Target: \`${report.target}\``,
    `- Now: \`${report.now}\``,
    `- Status: ${status}, ${report.warnings} warning(s)`,
    `- Export: \`${report.export.sha256}\``,
    "",
    "> This report is personal data: it lists legacy ids, and the overlay offenders quote the sponsors' text. Keep it in the gitignored plan folder with the export, and delete both as the runbook says.",
    "",
    "## Blockers",
    "",
  ];
  const blockers = report.sections.flatMap((part) =>
    part.issues
      .filter((issue) => issue.severity === "blocker")
      .map((issue) => ({ domain: part.domain, issue }))
  );
  if (blockers.length === 0) {
    lines.push("None.", "");
  } else {
    for (const { domain, issue } of blockers) {
      lines.push(...issueLines(issue, domain));
    }
    lines.push("");
  }
  lines.push("## Tables", "", "| Table | Rows |", "| --- | --- |");
  for (const [table, rows] of Object.entries(report.export.tables)) {
    lines.push(`| ${table} | ${rows} |`);
  }
  lines.push("");
  if (report.export.unknownTables.length > 0) {
    lines.push(
      `Ignored unknown tables: ${report.export.unknownTables.map((name) => `\`${name}\``).join(", ")}.`,
      ""
    );
  }
  for (const part of report.sections) {
    lines.push(`## ${part.domain}`, "");
    const counts = Object.entries(part.counts);
    if (counts.length > 0) {
      lines.push("| Count | Value |", "| --- | --- |");
      for (const [key, value] of counts) {
        lines.push(`| ${key} | ${value} |`);
      }
      lines.push("");
    }
    if (part.issues.length === 0) {
      lines.push(counts.length === 0 ? "Nothing to report." : "No issues.", "");
      continue;
    }
    for (const issue of part.issues) {
      lines.push(...issueLines(issue));
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(TRAILING_NEWLINES, "")}\n`;
}
