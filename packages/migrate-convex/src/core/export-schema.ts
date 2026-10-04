/**
 * The Convex export's nine tables (phase 8 task 5), as Zod schemas taken
 * field by field from the old `packages/convex/convex/schema.ts` (the
 * `ref-master` app), each with the system fields `_id` and
 * `_creationTime`.
 *
 * A Convex snapshot export holds `<table>/documents.jsonl` per table (one
 * JSON document per line) beside system folders (`_storage/`, `_tables/`,
 * …) that the reader skips. `validateExport` parses the table files:
 * - a row that does not match its schema, a line that is not JSON, or a
 *   duplicate `_id` is a **blocker** naming its table and `_id` (or line),
 *   in the section of the table's domain (`TABLE_DOMAINS`);
 * - a field the schema does not know is a **warning** (the field is
 *   dropped);
 * - a table that is not among the nine is listed and ignored;
 * - a table that is absent reads as empty, with a warning; an export with
 *   none of the nine is a blocker.
 *
 * Messages name tables, fields, ids and Zod's reason, never a value.
 * Rows come back sorted by `_creationTime`, then `_id`, so the order of
 * the export's lines never changes the plan.
 */
import { z } from "zod";
import type { ReportDomain, ReportIssue, ReportSection } from "./report";
import { section } from "./report";

const convexId = z.string().min(1);
const timestamp = z.number().finite();

const system = {
  _creationTime: timestamp,
  _id: convexId,
};

/** The old sponsorship statuses (`sponsorships.status`, a string in the schema). */
export const CONVEX_SPONSORSHIP_STATUSES = [
  "pending",
  "pending_payment",
  "pending_approval",
  "pending_resubmission",
  "active",
  "expired",
  "rejected",
  "cancelled",
] as const;
export type ConvexSponsorshipStatus =
  (typeof CONVEX_SPONSORSHIP_STATUSES)[number];

export const adminLogSchema = z.object({
  ...system,
  action: z.string(),
  createdAt: timestamp,
  metadata: z.unknown().optional(),
  targetId: z.string(),
  targetType: z.string(),
  userId: convexId,
});

export const categorySchema = z.object({
  ...system,
  isActive: z.boolean(),
  name: z.string(),
});

export const gestureListItemSchema = z.object({
  ...system,
  addedBy: convexId.optional(),
  createdAt: timestamp,
  gestureId: convexId,
  listId: convexId,
  position: z.number().finite(),
});

export const gestureListSchema = z.object({
  ...system,
  allowSharedEditing: z.boolean(),
  createdAt: timestamp,
  description: z.string().optional(),
  editShareToken: z.string().optional(),
  isDefaultFavorites: z.boolean(),
  name: z.string(),
  ownerId: convexId,
  updatedAt: timestamp,
  viewShareToken: z.string().optional(),
  visibility: z.enum(["private", "shared"]),
});

export const gestureSchema = z.object({
  ...system,
  categoryIds: z.array(convexId),
  concept: z.array(z.string()),
  info: z.string(),
  isActive: z.boolean(),
  lastUpdated: timestamp,
  name: z.string(),
  playbackId: z.string(),
});

export const sponsorshipSchema = z.object({
  ...system,
  contactCompany: z.string().optional(),
  contactFullName: z.string(),
  createdAt: timestamp,
  durationYears: z.number().finite(),
  endDate: timestamp,
  gestureId: convexId,
  hasLogo: z.boolean().optional(),
  invoiceEmail: z.string().optional(),
  invoiceName: z.string().optional(),
  invoiceRequested: z.boolean().optional(),
  invoiceVatNumber: z.string().optional(),
  molliePaymentId: z.string().optional(),
  originalVideoPlaybackId: z.string(),
  overlayImageStorageId: z.string().optional(),
  overlayText: z.string(),
  paymentAmount: z.number().finite(),
  previewVideoPlaybackId: z.string().optional(),
  reEditToken: z.string().optional(),
  reEditTokenExpiresAt: timestamp.optional(),
  rejectionReason: z.string().optional(),
  renewalReminderSentAt: timestamp.optional(),
  reviewedAt: timestamp.optional(),
  reviewedBy: convexId.optional(),
  sponsorEmail: z.string(),
  sponsoredVideoPlaybackId: z.string().optional(),
  sponsorName: z.string(),
  startDate: timestamp,
  status: z.enum(CONVEX_SPONSORSHIP_STATUSES),
  updatedAt: timestamp,
});

export const userConsentSchema = z.object({
  ...system,
  analyticsConsent: z.boolean(),
  consentDate: timestamp,
  consentVersion: z.string(),
  ipAddress: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  userAgent: z.string().optional(),
  userId: convexId,
});

export const userFavoriteSchema = z.object({
  ...system,
  createdAt: timestamp,
  gestureId: convexId,
  userId: convexId,
});

export const userSchema = z.object({
  ...system,
  createdAt: timestamp,
  email: z.string().optional(),
  guestId: z.string().optional(),
  lastActiveAt: timestamp,
  role: z.enum(["user", "admin"]).optional(),
  workosId: z.string().optional(),
});

/** The nine tables, by their Convex name. */
export const EXPORT_SCHEMAS = {
  adminLogs: adminLogSchema,
  categories: categorySchema,
  gesture_list_items: gestureListItemSchema,
  gesture_lists: gestureListSchema,
  gestures: gestureSchema,
  sponsorships: sponsorshipSchema,
  user_consents: userConsentSchema,
  user_favorites: userFavoriteSchema,
  users: userSchema,
} as const;

export type ExportTable = keyof typeof EXPORT_SCHEMAS;
export const EXPORT_TABLES = Object.keys(
  EXPORT_SCHEMAS
).sort() as ExportTable[];

export type AdminLogRow = z.infer<typeof adminLogSchema>;
export type CategoryRow = z.infer<typeof categorySchema>;
export type GestureListItemRow = z.infer<typeof gestureListItemSchema>;
export type GestureListRow = z.infer<typeof gestureListSchema>;
export type GestureRow = z.infer<typeof gestureSchema>;
export type SponsorshipRow = z.infer<typeof sponsorshipSchema>;
export type UserConsentRow = z.infer<typeof userConsentSchema>;
export type UserFavoriteRow = z.infer<typeof userFavoriteSchema>;
export type UserRow = z.infer<typeof userSchema>;

/** The validated export: every table's rows, sorted by `_creationTime`, `_id`. */
export type ConvexExport = {
  readonly [T in ExportTable]: readonly z.infer<(typeof EXPORT_SCHEMAS)[T]>[];
};

/** The report section each table's issues belong to. */
export const TABLE_DOMAINS: Record<ExportTable, ReportDomain> = {
  adminLogs: "account",
  categories: "catalog",
  gesture_list_items: "learning",
  gesture_lists: "learning",
  gestures: "catalog",
  sponsorships: "sponsorships",
  user_consents: "account",
  user_favorites: "learning",
  users: "users",
};

/**
 * The export as the readers hand it over: each table's `documents.jsonl`
 * text by table name (system tables already skipped).
 */
export type ExportFiles = Readonly<Record<string, string>>;

export interface ValidatedExport {
  readonly data: ConvexExport;
  /** The `export` section plus one section per domain that had issues. */
  readonly sections: readonly ReportSection[];
  /** Rows per known table. */
  readonly tables: Readonly<Record<ExportTable, number>>;
  readonly unknownTables: readonly string[];
}

const ISSUE_IDS_MAX = 50;
const ZOD_ISSUES_MAX = 3;

function isExportTable(name: string): name is ExportTable {
  return Object.hasOwn(EXPORT_SCHEMAS, name);
}

function zodReason(error: z.ZodError): string {
  return error.issues
    .slice(0, ZOD_ISSUES_MAX)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(row)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function compareRows(
  a: { _creationTime: number; _id: string },
  b: { _creationTime: number; _id: string }
): number {
  if (a._creationTime !== b._creationTime) {
    return a._creationTime - b._creationTime;
  }
  if (a._id === b._id) {
    return 0;
  }
  return a._id < b._id ? -1 : 1;
}

interface TableResult {
  issues: ReportIssue[];
  rows: { _creationTime: number; _id: string }[];
}

interface SystemRow {
  _creationTime: number;
  _id: string;
}

type ParsedLine =
  | { readonly issue: ReportIssue }
  | { readonly fields: readonly string[]; readonly row: SystemRow };

/** One JSONL line: its row and field names, or the blocker it is. */
function parseLine(
  table: ExportTable,
  line: string,
  lineNumber: number
): ParsedLine {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return {
      issue: {
        code: "unparsableLine",
        message: `${table}: line ${lineNumber} is not JSON.`,
        severity: "blocker",
      },
    };
  }
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const id =
    typeof record._id === "string" && record._id.length > 0 ? record._id : null;
  const parsed = EXPORT_SCHEMAS[table].safeParse(value);
  if (!parsed.success) {
    return {
      issue: {
        code: "malformedRow",
        ids: id ? [id] : [],
        message: `${table}: ${id ? `row ${id}` : `line ${lineNumber}`} does not match the schema (${zodReason(parsed.error)}).`,
        severity: "blocker",
      },
    };
  }
  return { fields: Object.keys(record), row: parsed.data as SystemRow };
}

function unknownFieldIssues(
  table: ExportTable,
  unknownFields: ReadonlyMap<string, readonly string[]>
): ReportIssue[] {
  return [...unknownFields]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([field, ids]) => ({
      code: "unknownField",
      count: ids.length,
      ids: ids.slice(0, ISSUE_IDS_MAX),
      message: `${table}: the field \`${field}\` is not in the schema; it is ignored.`,
      severity: "warning",
    }));
}

function validateTable(table: ExportTable, text: string): TableResult {
  const known = new Set(Object.keys(EXPORT_SCHEMAS[table].shape));
  const issues: ReportIssue[] = [];
  const rows: SystemRow[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const unknownFields = new Map<string, string[]>();
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    const parsed = parseLine(table, line, index + 1);
    if ("issue" in parsed) {
      issues.push(parsed.issue);
      continue;
    }
    const { row } = parsed;
    if (seen.has(row._id)) {
      duplicates.push(row._id);
      continue;
    }
    seen.add(row._id);
    for (const field of parsed.fields.filter((name) => !known.has(name))) {
      const ids = unknownFields.get(field) ?? [];
      ids.push(row._id);
      unknownFields.set(field, ids);
    }
    rows.push(row);
  }
  if (duplicates.length > 0) {
    issues.push({
      code: "duplicateId",
      ids: duplicates,
      message: `${table}: ${duplicates.length} row(s) repeat an _id.`,
      severity: "blocker",
    });
  }
  issues.push(...unknownFieldIssues(table, unknownFields));
  rows.sort(compareRows);
  return { issues, rows };
}

/** Parses and validates every table file of the export (see the module comment). */
export function validateExport(files: ExportFiles): ValidatedExport {
  const data: Record<string, readonly unknown[]> = {};
  const tables = {} as Record<ExportTable, number>;
  const exportIssues: ReportIssue[] = [];
  const sections: ReportSection[] = [];
  const unknownTables = Object.keys(files)
    .filter((name) => !isExportTable(name))
    .sort();
  if (unknownTables.length > 0) {
    exportIssues.push({
      code: "unknownTable",
      ids: unknownTables,
      message: `${unknownTables.length} table(s) are not among the nine Convex tables; they are ignored.`,
      severity: "warning",
    });
  }
  for (const table of EXPORT_TABLES) {
    const text = files[table];
    if (text === undefined) {
      exportIssues.push({
        code: "absentTable",
        ids: [table],
        message: `${table}: the export has no documents for it; it reads as empty.`,
        severity: "warning",
      });
      data[table] = [];
      tables[table] = 0;
      continue;
    }
    const result = validateTable(table, text);
    data[table] = result.rows;
    tables[table] = result.rows.length;
    if (result.issues.length > 0) {
      sections.push(section(TABLE_DOMAINS[table], {}, result.issues));
    }
  }
  if (EXPORT_TABLES.every((table) => files[table] === undefined)) {
    exportIssues.unshift({
      code: "emptyExport",
      message:
        "The export holds none of the nine tables (is it a Convex snapshot export, with <table>/documents.jsonl at its top level?).",
      severity: "blocker",
    });
  }
  sections.unshift(section("export", {}, exportIssues));
  return {
    data: data as ConvexExport,
    sections,
    tables,
    unknownTables,
  };
}
