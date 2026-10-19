/**
 * The sponsorship transform (phase 8 ruling 10; spec §5.4, §5.5, §15;
 * R-15): the export's `sponsorships` rows become `sponsor`,
 * `invoice_request`, `payment`, `payment_item`, `sponsorship`, one
 * `legacy` `sponsorship_event` each and the unexpired re-edit tokens.
 *
 * - **Checkouts.** Rows are grouped by `molliePaymentId`; a row without
 *   one is its own checkout. Each checkout gets one `sponsor` (its first
 *   row's contact, `locale = "nl"`), one `invoice_request` when it asked
 *   for an invoice (B3: `invoiceName ?? contactCompany ?? contactFullName`,
 *   `invoiceEmail ?? sponsorEmail`, the VAT number trimmed; a missing one
 *   is `""` with a warning, one that fails mod-97 is kept with a warning),
 *   and one `initial` `payment` with a `payment_item` per row: always
 *   with a Mollie id, and without one only when a row is paid (marked
 *   paid by hand, with its `marked_paid_manually` event) or open (a fresh
 *   checkout that never reached Mollie). Rows of one payment that are
 *   partly open are a blocker (task 8 review I3).
 * - **Statuses** (`mapSponsorshipStatus`): the old state machine
 *   (`ref-master/packages/convex/convex/sponsorships.ts`) onto spec §5.5.
 *   A `pending_payment` with a Mollie id is never cancelled here (I4):
 *   the first stale sweep asks Mollie. The importer writes final states
 *   as data; the app's `transition()` never runs here.
 * - **`display_name`** is the trimmed `overlayText`, the text in the video,
 *   or its `overlay-overrides.json` entry. A text the wizard would refuse
 *   (over 35 characters, empty, a line break) is a blocker listing the
 *   row: it is what the sponsor paid for, so it is never cut.
 * - **Videos.** `video_playback_id` is the sponsored video (for
 *   `in_review`, the preview when there is none; with neither the row is
 *   `render_failed`). `video_asset_id` comes from the Mux map. Logos are
 *   not migrated (`logo_key` NULL; `includes_logo` keeps the fact), and
 *   an old logo data URL becomes a marker in the legacy data (I2).
 * - **Blockers:** a row whose gesture is not in the export, and two
 *   blocking sponsorships on one gesture after mapping
 *   (`sponsorship_gesture_blocking_uq`). A row with a missing gesture is
 *   left out of the SQL.
 *
 * Users and gestures are found through their `legacy_id` (`legacyIdRef`),
 * so this transform does not depend on the users and catalogue transforms
 * (task 7). Every personal or secret value goes through `pseudonymiser`;
 * no message names an email, a name or a token.
 */
import { DISPLAY_NAME_MAX } from "@smog/config/constants";
import {
  BLOCKING_SPONSORSHIP_STATUSES,
  invoiceRequest,
  type PaymentStatus,
  payment,
  paymentItem,
  type SponsorshipStatus,
  sponsor,
  sponsorship,
  sponsorshipEvent,
  sponsorshipToken,
} from "@smog/db";
import {
  COMPANY_MAX,
  CONTACT_NAME_MAX,
  displayNameSchema,
  EMAIL_MAX,
  hashSponsorshipToken,
  INVOICE_NAME_MAX,
  normalizeBelgianVat,
  sponsorshipTokenSchema,
} from "@smog/sponsorships/schema";
import { DAY_MS, sha256Hex } from "@smog/utils";
import { insertRow, legacyIdRef, type RawSql, type ResetKeys } from "../emit";
import type {
  AdminLogRow,
  ConvexSponsorshipStatus,
  SponsorshipRow,
} from "../export-schema";
import { legacyKey, legacyUuid } from "../ids";
import type { MuxMap } from "../inputs";
import type { TransformContext, TransformResult } from "../plan";
import {
  type DetailValue,
  type ReportIssue,
  type Severity,
  section,
} from "../report";
import { type Pseudonymiser, pseudonymiser } from "../target";

/** A `pending_payment` row last changed more than this before `--now` is cancelled. */
const STALE_PAYMENT_MS = DAY_MS;

/** The amounts the old checkout charged per gesture (cents): without and with a logo. */
const KNOWN_AMOUNTS: readonly number[] = [5000, 6000];
const LOGO_AMOUNT = 6000;

const EMAIL_MIN = 3;
const BLOCKING: ReadonlySet<SponsorshipStatus> = new Set(
  BLOCKING_SPONSORSHIP_STATUSES
);
/** The statuses whose `starts_at` / `ends_at` are kept. */
const DATED: ReadonlySet<SponsorshipStatus> = new Set([
  "live",
  "expiring",
  "expired",
]);

export interface MappedStatus {
  /** Its part of the checkout's payment; null when it has none (`pending`). */
  readonly payment: PaymentStatus | null;
  /** A `pending_payment` without a Mollie id cancelled by the 24-hour rule. */
  readonly stale: boolean;
  readonly status: SponsorshipStatus;
  readonly videoPlaybackId: string | null;
}

type StatusRow = Pick<
  SponsorshipRow,
  | "previewVideoPlaybackId"
  | "renewalReminderSentAt"
  | "sponsoredVideoPlaybackId"
  | "status"
  | "updatedAt"
>;

/**
 * Ruling 10's status table, as amended (task 8 review I1, I4). `pending`
 * is the legacy flow before Mollie. A `pending_payment` row is never
 * cancelled locally while it has a Mollie id: it becomes
 * `awaiting_payment` with an `open` payment, whatever its age, and the
 * first stale sweep asks Mollie (settle, revive or cancel; D-STALE).
 * Without a Mollie id no money can arrive: a row whose `updatedAt` is
 * more than 24 hours before `now` is cancelled, a newer one is
 * `awaiting_payment` with an `open` payment that has no Mollie id, which
 * the sweep or an admin handles.
 */
export function mapSponsorshipStatus(
  row: StatusRow,
  now: Date,
  hasMollieId: boolean
): MappedStatus {
  const sponsored = row.sponsoredVideoPlaybackId ?? null;
  const old: ConvexSponsorshipStatus = row.status;
  switch (old) {
    case "pending":
      return {
        payment: null,
        stale: false,
        status: "cancelled",
        videoPlaybackId: sponsored,
      };
    case "pending_payment": {
      const stale =
        !hasMollieId && row.updatedAt < now.getTime() - STALE_PAYMENT_MS;
      return stale
        ? {
            payment: null,
            stale,
            status: "cancelled",
            videoPlaybackId: sponsored,
          }
        : {
            payment: "open",
            stale,
            status: "awaiting_payment",
            videoPlaybackId: sponsored,
          };
    }
    case "pending_approval": {
      const video = sponsored ?? row.previewVideoPlaybackId ?? null;
      return {
        payment: "paid",
        stale: false,
        status: video === null ? "render_failed" : "in_review",
        videoPlaybackId: video,
      };
    }
    case "pending_resubmission":
      return {
        payment: "paid",
        stale: false,
        status: "changes_requested",
        videoPlaybackId: sponsored,
      };
    case "active":
      return {
        payment: "paid",
        stale: false,
        status: row.renewalReminderSentAt === undefined ? "live" : "expiring",
        videoPlaybackId: sponsored,
      };
    case "expired":
    case "rejected":
      return {
        payment: "paid",
        stale: false,
        status: old,
        videoPlaybackId: sponsored,
      };
    case "cancelled":
      return {
        payment: "canceled",
        stale: false,
        status: "cancelled",
        videoPlaybackId: sponsored,
      };
    default:
      throw new Error(
        `[migrate-convex] Unknown sponsorship status: ${old satisfies never}`
      );
  }
}

/** A checkout's payment status from its rows' parts: paid wins, then open. */
export function checkoutPaymentStatus(
  parts: readonly PaymentStatus[]
): PaymentStatus | null {
  if (parts.length === 0) {
    return null;
  }
  if (parts.includes("paid")) {
    return "paid";
  }
  if (parts.includes("open")) {
    return "open";
  }
  return "canceled";
}

// --- Issues -----------------------------------------------------------------

interface IssueBucket {
  details: Record<string, DetailValue>[];
  ids: string[];
  message: string;
  personal: boolean;
  severity: Severity;
}

/** Issues of one code share one entry; ids are listed in plan order. */
class Issues {
  private readonly byCode = new Map<string, IssueBucket>();

  add(
    severity: Severity,
    code: string,
    message: string,
    id: string,
    detail?: Record<string, DetailValue>,
    personal = false
  ): void {
    const bucket = this.byCode.get(code) ?? {
      details: [],
      ids: [],
      message,
      personal: false,
      severity,
    };
    if (!bucket.ids.includes(id)) {
      bucket.ids.push(id);
    }
    if (detail) {
      bucket.details.push(detail);
    }
    bucket.personal ||= personal;
    this.byCode.set(code, bucket);
  }

  list(): ReportIssue[] {
    return [...this.byCode].map(([code, bucket]) => ({
      code,
      count: bucket.ids.length,
      ...(bucket.details.length > 0 ? { details: bucket.details } : {}),
      ids: bucket.ids,
      message: bucket.message,
      ...(bucket.personal ? { personal: true } : {}),
      severity: bucket.severity,
    }));
  }
}

// --- Helpers ----------------------------------------------------------------

function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function characters(text: string): number {
  return [...text].length;
}

/** `text` cut to `max` characters (code points, as SQLite's `length()` counts). */
function cut(text: string, max: number): string {
  return [...text].slice(0, max).join("").trimEnd();
}

const ms = (value: number): Date => new Date(value);

// --- The transform ----------------------------------------------------------

/** What the transform writes, as typed rows (the tests read them). */
interface SponsorshipRows {
  readonly events: readonly (Omit<
    typeof sponsorshipEvent.$inferInsert,
    "actorId"
  > & { actorId: RawSql | null })[];
  readonly invoiceRequests: readonly (typeof invoiceRequest.$inferInsert)[];
  readonly paymentItems: readonly (typeof paymentItem.$inferInsert)[];
  readonly payments: readonly (typeof payment.$inferInsert)[];
  readonly sponsors: readonly (typeof sponsor.$inferInsert)[];
  readonly sponsorships: readonly (Omit<
    typeof sponsorship.$inferInsert,
    "gestureId"
  > & { gestureId: RawSql; legacyId: string })[];
  readonly tokens: readonly (typeof sponsorshipToken.$inferInsert)[];
}

export interface SponsorshipTransformResult extends TransformResult {
  readonly rows: SponsorshipRows;
}

interface Checkout {
  readonly key: string;
  readonly mollieId: string | null;
  readonly rows: SponsorshipRow[];
}

function checkoutsOf(rows: readonly SponsorshipRow[]): Checkout[] {
  const byKey = new Map<string, Checkout>();
  for (const row of rows) {
    const mollieId = trimmed(row.molliePaymentId);
    const key = mollieId === null ? row._id : legacyKey("mollie", mollieId);
    const checkout = byKey.get(key) ?? { key, mollieId, rows: [] };
    checkout.rows.push(row);
    byKey.set(key, checkout);
  }
  return [...byKey.values()];
}

interface Context {
  readonly counts: Record<string, number>;
  readonly issues: Issues;
  /**
   * The old admin's `mark_paid_manually` logs (M3), by sponsorship: the
   * first one per row.
   */
  readonly manualMarks: ReadonlyMap<string, AdminLogRow>;
  readonly muxMap: MuxMap | null;
  readonly now: Date;
  readonly overrides: ReadonlyMap<string, string> | null;
  readonly p: Pseudonymiser;
  /** The export's user ids (`reviewedBy` → `actor_id`). */
  readonly users: ReadonlySet<string>;
}

function count(context: Context, key: string, by = 1): void {
  context.counts[key] = (context.counts[key] ?? 0) + by;
}

/** The sponsor's contact, from the checkout's first row (B3's NOT NULL rules). */
function contactOf(context: Context, checkout: Checkout) {
  const [first] = checkout.rows;
  if (!first) {
    throw new Error("[migrate-convex] A checkout without rows");
  }
  const differs = checkout.rows.some(
    (row) =>
      row.contactFullName !== first.contactFullName ||
      row.sponsorEmail !== first.sponsorEmail ||
      row.contactCompany !== first.contactCompany
  );
  if (differs) {
    context.issues.add(
      "warning",
      "checkoutContactDiffers",
      "The rows of one checkout hold different contacts; the first row's is kept for its sponsor.",
      first._id
    );
  }
  let name = trimmed(first.contactFullName);
  if (name === null) {
    name = trimmed(first.sponsorName);
    context.issues.add(
      name === null ? "blocker" : "warning",
      name === null ? "sponsorNameMissing" : "sponsorNameFromCredit",
      name === null
        ? "A checkout has no contact name and no sponsor name; the sponsor row needs one."
        : "A checkout has no contact name; its sponsor name is used.",
      first._id
    );
  }
  if (name !== null && characters(name) > CONTACT_NAME_MAX) {
    context.issues.add(
      "warning",
      "sponsorFieldCut",
      `A sponsor's name or company is longer than ${CONTACT_NAME_MAX} characters and is cut.`,
      first._id
    );
    name = cut(name, CONTACT_NAME_MAX);
  }
  let company = trimmed(first.contactCompany);
  if (company !== null && characters(company) > COMPANY_MAX) {
    context.issues.add(
      "warning",
      "sponsorFieldCut",
      `A sponsor's name or company is longer than ${CONTACT_NAME_MAX} characters and is cut.`,
      first._id
    );
    company = cut(company, COMPANY_MAX);
  }
  const email = first.sponsorEmail.trim();
  if (email.length < EMAIL_MIN || email.length > EMAIL_MAX) {
    context.issues.add(
      "blocker",
      "sponsorEmailInvalid",
      `A checkout's sponsor email is not ${EMAIL_MIN}..${EMAIL_MAX} characters long.`,
      first._id
    );
  }
  return { company, email, first, name };
}

/** B3: the invoice request of a checkout that asked for one, or null. */
function invoiceOf(
  context: Context,
  checkout: Checkout,
  contact: ReturnType<typeof contactOf>
): { email: string; name: string; vatNumber: string } | null {
  const asked = checkout.rows.filter((row) => row.invoiceRequested === true);
  const [source] = asked;
  if (!source) {
    return null;
  }
  if (asked.length !== checkout.rows.length) {
    context.issues.add(
      "warning",
      "invoiceRequestPartial",
      "Only some rows of a checkout asked for an invoice; the checkout gets one invoice request.",
      source._id
    );
  }
  let name =
    trimmed(source.invoiceName) ??
    trimmed(source.contactCompany) ??
    trimmed(source.contactFullName) ??
    contact.name ??
    "";
  if (characters(name) > INVOICE_NAME_MAX) {
    context.issues.add(
      "warning",
      "invoiceNameCut",
      `An invoice name is longer than ${INVOICE_NAME_MAX} characters and is cut.`,
      source._id
    );
    name = cut(name, INVOICE_NAME_MAX);
  }
  const email = trimmed(source.invoiceEmail) ?? source.sponsorEmail.trim();
  if (email.length < EMAIL_MIN || email.length > EMAIL_MAX) {
    context.issues.add(
      "blocker",
      "invoiceEmailInvalid",
      `An invoice email is not ${EMAIL_MIN}..${EMAIL_MAX} characters long.`,
      source._id
    );
  }
  const vatNumber = source.invoiceVatNumber?.trim() ?? "";
  if (vatNumber.length === 0) {
    context.issues.add(
      "warning",
      "invoiceVatMissing",
      'An invoice request has no VAT number; it is stored as "" (imported rows skip the mod-97 rule).',
      source._id
    );
  } else if (normalizeBelgianVat(vatNumber) === null) {
    context.issues.add(
      "warning",
      "invoiceVatInvalid",
      "An invoice request's VAT number fails the Belgian mod-97 check; it is kept as it is.",
      source._id
    );
  }
  return { email, name, vatNumber };
}

/**
 * `display_name`: the override, else the trimmed `overlayText`. A text the
 * wizard would refuse is a blocker listing the row (its text, its
 * `sponsorName`, its old status and its length: personal data), and the
 * row keeps the cut text only so the plan can still render it.
 */
function displayNameOf(
  context: Context,
  row: SponsorshipRow,
  n: number
): string {
  const override = context.overrides?.get(row._id);
  if (override !== undefined) {
    count(context, "overlayOverrides");
    return context.p.name("sponsor", n, override);
  }
  const text = row.overlayText.trim();
  const parsed = displayNameSchema.safeParse(text);
  if (parsed.success) {
    return context.p.name("sponsor", n, parsed.data);
  }
  // One rule (M5): the wizard's own schema decides, and its first issue
  // names the reason; `length` is the length that schema measures.
  const [first] = parsed.error.issues;
  let reason = "controlCharacters";
  if (first?.code === "too_small") {
    reason = "empty";
  } else if (first?.code === "too_big") {
    reason = "tooLong";
  }
  const { length } = text;
  context.issues.add(
    "blocker",
    "overlayOffender",
    `An overlay text is not a valid display name (1..${DISPLAY_NAME_MAX} characters on one line). Add the row to overlay-overrides.json; the sponsor paid for this text, so it is never cut silently.`,
    row._id,
    {
      legacyId: row._id,
      length,
      overlayText: context.p.name("sponsor", n, text),
      reason,
      sponsorName: context.p.freeText(row.sponsorName),
      status: row.status,
    },
    !context.p.pseudonymised
  );
  return context.p.name("sponsor", n, cut(text, DISPLAY_NAME_MAX) || "-");
}

const DATA_URL = /^data:[^,]*,/i;
const BASE64_DATA_URL = /^data:[^,]*;base64,/i;
const BASE64_PADDING = /[=]+$/;
const encoder = new TextEncoder();

/**
 * What the legacy data keeps of `overlayImageStorageId` (task 8 review
 * I2). In the old legacy flow it held the logo itself as a data URL, so
 * the value is never copied: a data URL becomes `{ kind: "dataUrl",
 * bytes, sha256 }` (its decoded size and the SHA-256 of the whole URL),
 * anything else `{ kind: "storageId", sha256 }`.
 */
interface OverlayImageMarker {
  readonly bytes?: number;
  readonly kind: "dataUrl" | "storageId";
  readonly sha256: string;
}

function decodedLength(payload: string): number {
  try {
    return encoder.encode(decodeURIComponent(payload)).length;
  } catch {
    return encoder.encode(payload).length;
  }
}

async function overlayImageMarker(
  value: string | undefined
): Promise<OverlayImageMarker | null> {
  if (value === undefined) {
    return null;
  }
  const sha256 = await sha256Hex(value);
  if (!DATA_URL.test(value)) {
    return { kind: "storageId", sha256 };
  }
  const payload = value.slice(value.indexOf(",") + 1);
  const bytes = BASE64_DATA_URL.test(value)
    ? Math.floor((payload.replace(BASE64_PADDING, "").length * 3) / 4)
    : decodedLength(payload);
  return { bytes, kind: "dataUrl", sha256 };
}

/** The legacy event's `data.legacy` (M4), with the free text pseudonymised. */
function legacyData(
  p: Pseudonymiser,
  row: SponsorshipRow,
  overlayImage: OverlayImageMarker | null
) {
  return {
    legacy: {
      durationYears: row.durationYears,
      hasLogo: row.hasLogo ?? null,
      originalVideoPlaybackId: row.originalVideoPlaybackId,
      overlayImage,
      overlayText: p.freeText(row.overlayText),
      previewVideoPlaybackId: row.previewVideoPlaybackId ?? null,
      rejectionReason: p.freeText(row.rejectionReason ?? null),
      /** Epoch ms, as Convex stored it: the bound on `rejected → changes_requested` reads it. */
      reviewedAt: row.reviewedAt ?? null,
      sponsorName: p.freeText(row.sponsorName),
      status: row.status,
    },
  };
}

// --- Ids (computed up front, so the rest is synchronous) --------------------

interface RowIds {
  readonly event: string;
  /** The `marked_paid_manually` event's id. */
  readonly manualEvent: string;
  readonly overlayImage: OverlayImageMarker | null;
  readonly sponsorship: string;
  readonly token: string;
  /** The SHA-256 of the raw re-edit token, when the row has one. */
  readonly tokenHash: string | null;
}

interface CheckoutIds {
  readonly payment: string;
  readonly sponsor: string;
}

interface Ids {
  readonly checkouts: ReadonlyMap<string, CheckoutIds>;
  readonly rows: ReadonlyMap<string, RowIds>;
}

async function idsOf(checkouts: readonly Checkout[]): Promise<Ids> {
  const checkoutIds = await Promise.all(
    checkouts.map(
      async (checkout): Promise<[string, CheckoutIds]> => [
        checkout.key,
        {
          payment: await legacyUuid("payment", checkout.key),
          sponsor: await legacyUuid("sponsor", checkout.key),
        },
      ]
    )
  );
  const rowIds = await Promise.all(
    checkouts
      .flatMap((checkout) => checkout.rows)
      .map(
        async (row): Promise<[string, RowIds]> => [
          row._id,
          {
            event: await legacyUuid(
              "sponsorship_event",
              legacyKey(row._id, "legacy")
            ),
            manualEvent: await legacyUuid(
              "sponsorship_event",
              legacyKey(row._id, "marked_paid_manually")
            ),
            overlayImage: await overlayImageMarker(row.overlayImageStorageId),
            sponsorship: await legacyUuid("sponsorship", row._id),
            token: await legacyUuid(
              "sponsorship_token",
              legacyKey(row._id, "reedit")
            ),
            tokenHash:
              row.reEditToken === undefined
                ? null
                : await hashSponsorshipToken(row.reEditToken),
          },
        ]
      )
  );
  return { checkouts: new Map(checkoutIds), rows: new Map(rowIds) };
}

function rowIdsOf(ids: Ids, row: SponsorshipRow): RowIds {
  const found = ids.rows.get(row._id);
  if (!found) {
    throw new Error(`[migrate-convex] No ids for sponsorship ${row._id}`);
  }
  return found;
}

// --- The rows ---------------------------------------------------------------

type EventRow = SponsorshipRows["events"][number];
type InvoiceRequestRow = SponsorshipRows["invoiceRequests"][number];
type PaymentItemRow = SponsorshipRows["paymentItems"][number];
type PaymentRow = SponsorshipRows["payments"][number];
type SponsorRow = SponsorshipRows["sponsors"][number];
type SponsorshipInsert = SponsorshipRows["sponsorships"][number];
type TokenRow = SponsorshipRows["tokens"][number];

interface Out {
  readonly events: EventRow[];
  readonly invoiceRequests: InvoiceRequestRow[];
  readonly paymentItems: PaymentItemRow[];
  readonly payments: PaymentRow[];
  /** The token hashes written so far (a repeated one is a blocker). */
  readonly seenTokens: Set<string>;
  readonly sponsors: SponsorRow[];
  readonly sponsorships: SponsorshipInsert[];
  readonly tokens: TokenRow[];
}

/** Overrides naming no sponsorship of the export. */
function checkUnknownOverrides(
  context: Context,
  all: readonly SponsorshipRow[]
): void {
  const known = new Set(all.map((row) => row._id));
  for (const key of context.overrides?.keys() ?? []) {
    if (!known.has(key)) {
      context.issues.add(
        "warning",
        "unknownOverride",
        "overlay-overrides.json names a sponsorship that is not in the export.",
        key
      );
    }
  }
}

/** The rows whose gesture is in the export; the others are blockers. */
function withGesture(
  context: Context,
  all: readonly SponsorshipRow[],
  gestures: ReadonlySet<string>
): SponsorshipRow[] {
  return all.filter((row) => {
    if (gestures.has(row.gestureId)) {
      return true;
    }
    context.issues.add(
      "blocker",
      "missingGesture",
      "A sponsorship's gesture is not in the export; the row is left out.",
      row._id
    );
    return false;
  });
}

/** The one-blocking-sponsorship index (`sponsorship_gesture_blocking_uq`), after mapping. */
function checkBlocking(
  context: Context,
  rows: readonly SponsorshipRow[],
  mapped: ReadonlyMap<string, MappedStatus>
): void {
  const byGesture = new Map<string, string[]>();
  for (const row of rows) {
    const status = mapped.get(row._id)?.status;
    if (status !== undefined && BLOCKING.has(status)) {
      byGesture.set(row.gestureId, [
        ...(byGesture.get(row.gestureId) ?? []),
        row._id,
      ]);
    }
  }
  for (const ids of byGesture.values()) {
    if (ids.length < 2) {
      continue;
    }
    for (const id of ids) {
      context.issues.add(
        "blocker",
        "blockingConflict",
        "Two or more sponsorships of one gesture are pending or active after mapping; a gesture holds one (fix them in the old admin).",
        id
      );
    }
  }
}

/**
 * I3: a payment whose rows map to different states would strand a row
 * (a `paid` payment holding an `awaiting_payment` item, which nothing
 * settles, or an `open` one holding a `cancelled` item, whose share a
 * later `paid` would take silently). Any mix with `open` is a blocker
 * naming the Mollie id and the rows; `paid` beside `canceled` only warns.
 */
function checkMixedPayment(
  context: Context,
  checkout: Checkout,
  mapped: ReadonlyMap<string, MappedStatus>,
  parts: ReadonlySet<PaymentStatus>
): void {
  if (parts.size < 2) {
    return;
  }
  const blocker = parts.has("open");
  for (const row of checkout.rows) {
    const status = mapped.get(row._id);
    context.issues.add(
      blocker ? "blocker" : "warning",
      blocker ? "checkoutMixedPayment" : "checkoutPartlyCancelled",
      blocker
        ? "The rows of one Mollie payment are partly open and partly paid or cancelled; settle them in the old admin before the export (the payment would strand a row)."
        : "The rows of one paid Mollie payment include a cancelled one; the payment stays paid.",
      row._id,
      {
        legacyId: row._id,
        mollieId: checkout.mollieId,
        payment: status?.payment ?? null,
        status: status?.status ?? null,
      }
    );
  }
}

/**
 * The checkout's `initial` payment, or null. With a Mollie id: one
 * payment for every row that has a payment part. Without one (I1, M1): a
 * payment only when a row is `paid` (the old admin's mark-paid) or `open`
 * (a fresh `pending_payment`), with `mollie_id` NULL, so the item keeps
 * its amount and paid logo and the sweep or an admin can reach it.
 */
function paymentOf(
  context: Context,
  checkout: Checkout,
  mapped: ReadonlyMap<string, MappedStatus>,
  paymentId: string
): PaymentRow | null {
  const parts: PaymentStatus[] = [];
  const paid: SponsorshipRow[] = [];
  for (const row of checkout.rows) {
    const part = mapped.get(row._id)?.payment ?? null;
    if (part !== null) {
      parts.push(part);
      paid.push(row);
    }
  }
  const status = checkoutPaymentStatus(parts);
  if (
    status === null ||
    (checkout.mollieId === null && status !== "paid" && status !== "open")
  ) {
    return null;
  }
  checkMixedPayment(context, checkout, mapped, new Set(parts));
  for (const row of paid) {
    if (!Number.isSafeInteger(row.paymentAmount) || row.paymentAmount < 0) {
      context.issues.add(
        "blocker",
        "amountInvalid",
        "A payment amount is not a whole, non-negative number of cents.",
        row._id
      );
    }
  }
  return {
    amountCents: paid.reduce((sum, row) => sum + row.paymentAmount, 0),
    checkoutUrl: null,
    createdAt: ms(Math.min(...checkout.rows.map((row) => row.createdAt))),
    currency: "EUR",
    id: paymentId,
    kind: "initial",
    mollieId: checkout.mollieId,
    // Minutes before the payment: an older `paid_at` keeps the sponsor
    // email window short (risk 12).
    paidAt:
      status === "paid"
        ? ms(Math.min(...paid.map((row) => row.createdAt)))
        : null,
    status,
    updatedAt: ms(Math.max(...checkout.rows.map((row) => row.updatedAt))),
  };
}

/** The sponsor and invoice request of a checkout. */
function writeSponsor(
  context: Context,
  checkout: Checkout,
  n: number,
  sponsorId: string,
  out: Out
): void {
  const { p } = context;
  const contact = contactOf(context, checkout);
  out.sponsors.push({
    company: p.company(contact.company),
    createdAt: ms(Math.min(...checkout.rows.map((row) => row.createdAt))),
    email: p.email(sponsorId, contact.email),
    id: sponsorId,
    locale: "nl",
    name: p.name("sponsor", n, contact.name ?? ""),
  });
  const invoice = invoiceOf(context, checkout, contact);
  if (invoice) {
    out.invoiceRequests.push({
      email: p.email(sponsorId, invoice.email),
      name: p.name("sponsor", n, invoice.name),
      sponsorId,
      vatNumber: p.vat(invoice.vatNumber),
    });
  }
}

/** The statuses that render (again) after the import. */
const RERENDERED: ReadonlySet<SponsorshipStatus> = new Set([
  "in_review",
  "render_failed",
  "changes_requested",
]);

/** Counts and notes about one row that change nothing it writes. */
function noteRow(
  context: Context,
  row: SponsorshipRow,
  status: MappedStatus,
  hasPayment: boolean,
  includesLogo: boolean
): void {
  const { issues } = context;
  count(context, `status.${status.status}`);
  if (status.stale) {
    count(context, "stalePendingPayments");
  }
  if (row.overlayImageStorageId !== undefined) {
    count(context, "overlayImagesDropped");
  }
  if (status.status === "render_failed") {
    issues.add(
      "info",
      "reviewWithoutVideo",
      "A paid sponsorship awaiting review has no sponsored or preview video; it becomes render_failed (Retry render makes one).",
      row._id
    );
  }
  if (hasPayment && row.molliePaymentId === undefined) {
    issues.add(
      "info",
      "paymentWithoutMollieId",
      "A sponsorship's payment has no Mollie id (marked paid by hand, or a checkout that never reached Mollie); its payment row has mollie_id NULL.",
      row._id
    );
  }
  if (hasPayment && !KNOWN_AMOUNTS.includes(row.paymentAmount)) {
    issues.add(
      "warning",
      "unexpectedAmount",
      `A sponsorship's amount is neither ${KNOWN_AMOUNTS.join(" nor ")} cents; it is kept.`,
      row._id
    );
  }
  if (includesLogo && RERENDERED.has(status.status)) {
    issues.add(
      "info",
      "logoNotStored",
      "A sponsorship paid for a logo, but logos are not migrated: a new render has none (I12).",
      row._id
    );
  }
}

/** The Mux asset of the row's video, from the map, with a warning when it has none. */
function videoAssetOf(
  context: Context,
  row: SponsorshipRow,
  playbackId: string | null
): string | null {
  if (playbackId === null) {
    return null;
  }
  const assetId = context.muxMap?.get(playbackId)?.assetId ?? null;
  if (assetId === null) {
    context.issues.add(
      "warning",
      "missingMuxAsset",
      context.muxMap === null
        ? "No --mux-map was given: a sponsorship video gets no asset id."
        : "A sponsorship video is not in the Mux map; it gets no asset id.",
      row._id
    );
  }
  return assetId;
}

/** R-15: an unexpired re-edit token as its hash, with the same expiry. */
function tokenOf(
  context: Context,
  row: SponsorshipRow,
  ids: RowIds,
  seen: Set<string>
): TokenRow | null {
  const { issues } = context;
  const { reEditToken: token, reEditTokenExpiresAt: expiresAt } = row;
  if (token === undefined || ids.tokenHash === null) {
    return null;
  }
  if (expiresAt === undefined) {
    issues.add(
      "warning",
      "reeditTokenWithoutExpiry",
      "A re-edit token has no expiry; it is not migrated.",
      row._id
    );
    return null;
  }
  if (expiresAt <= context.now.getTime()) {
    count(context, "reeditTokensExpired");
    return null;
  }
  count(context, "reeditTokens");
  if (!sponsorshipTokenSchema.safeParse(token).success) {
    issues.add(
      "warning",
      "reeditTokenShape",
      "A re-edit token is neither a UUID nor a new token; its link will not open.",
      row._id
    );
  }
  if (seen.has(ids.tokenHash)) {
    issues.add(
      "blocker",
      "duplicateToken",
      "Two sponsorships hold the same re-edit token.",
      row._id
    );
  }
  seen.add(ids.tokenHash);
  return {
    createdAt: ms(row.updatedAt),
    expiresAt: ms(expiresAt),
    id: ids.token,
    purpose: "reedit",
    sponsorshipId: ids.sponsorship,
    tokenHash: ids.tokenHash,
    usedAt: null,
  };
}

interface RowPlace {
  readonly n: number;
  readonly paymentId: string | null;
  readonly sponsorId: string;
}

/** One sponsorship with its payment item, its legacy event and its token. */
function writeSponsorship(
  context: Context,
  row: SponsorshipRow,
  status: MappedStatus,
  place: RowPlace,
  ids: RowIds,
  out: Out
): void {
  const includesLogo = row.hasLogo ?? row.paymentAmount === LOGO_AMOUNT;
  const { paymentId } = place;
  const hasPayment = paymentId !== null && status.payment !== null;
  noteRow(context, row, status, hasPayment, includesLogo);
  if (paymentId !== null && hasPayment) {
    out.paymentItems.push({
      amountCents: row.paymentAmount,
      includesLogo,
      paymentId,
      sponsorshipId: ids.sponsorship,
    });
  }
  const dated = DATED.has(status.status);
  const videoAssetId = videoAssetOf(context, row, status.videoPlaybackId);
  out.sponsorships.push({
    createdAt: ms(row.createdAt),
    displayName: displayNameOf(context, row, place.n),
    endsAt: dated ? ms(row.endDate) : null,
    gestureId: legacyIdRef("gesture", row.gestureId),
    id: ids.sponsorship,
    legacyId: row._id,
    logoKey: null,
    reminderSentAt:
      row.renewalReminderSentAt === undefined
        ? null
        : ms(row.renewalReminderSentAt),
    sponsorId: place.sponsorId,
    startsAt: dated ? ms(row.startDate) : null,
    status: status.status,
    updatedAt: ms(row.updatedAt),
    videoAssetId: context.p.assetId(videoAssetId),
    videoPlaybackId: status.videoPlaybackId,
  });
  out.events.push({
    actorId:
      row.reviewedBy !== undefined && context.users.has(row.reviewedBy)
        ? legacyIdRef("user", row.reviewedBy)
        : null,
    createdAt: ms(row.updatedAt),
    data: legacyData(context.p, row, ids.overlayImage),
    id: ids.event,
    sponsorshipId: ids.sponsorship,
    type: "legacy",
  });
  const mark = context.manualMarks.get(row._id);
  if (mark && paymentId !== null && status.payment === "paid") {
    count(context, "markedPaidManually");
    out.events.push({
      actorId: context.users.has(mark.userId)
        ? legacyIdRef("user", mark.userId)
        : null,
      createdAt: ms(mark.createdAt),
      data: { paymentId },
      id: ids.manualEvent,
      sponsorshipId: ids.sponsorship,
      type: "marked_paid_manually",
    });
  }
  const token = tokenOf(context, row, ids, out.seenTokens);
  if (token) {
    out.tokens.push(token);
  }
}

/** Every insert, in foreign-key order, each naming its conflict target (ruling 7). */
function statementsOf(out: Out, tokens: readonly TokenRow[]): string[] {
  return [
    ...out.sponsors.map((row) => insertRow(sponsor, row, [[sponsor.id]])),
    ...out.invoiceRequests.map((row) =>
      insertRow(invoiceRequest, row, [[invoiceRequest.sponsorId]])
    ),
    ...out.payments.map((row) => insertRow(payment, row, [[payment.id]])),
    ...out.sponsorships.map((row) =>
      insertRow(sponsorship, row, [[sponsorship.legacyId]])
    ),
    ...out.paymentItems.map((row) =>
      insertRow(paymentItem, row, [
        [paymentItem.paymentId, paymentItem.sponsorshipId],
      ])
    ),
    ...out.events.map((row) =>
      insertRow(sponsorshipEvent, row, [[sponsorshipEvent.id]])
    ),
    ...tokens.map((row) =>
      insertRow(sponsorshipToken, row, [[sponsorshipToken.id]])
    ),
  ];
}

function resetKeysOf(out: Out, tokens: readonly TokenRow[]): ResetKeys {
  return {
    rows: {
      invoice_request: out.invoiceRequests.map((row) => row.sponsorId),
      payment: out.payments.map((row) => row.id),
      payment_item: out.paymentItems.map((row) => [
        row.paymentId,
        row.sponsorshipId,
      ]),
      sponsor: out.sponsors.map((row) => row.id),
      sponsorship: out.sponsorships.map((row) => row.id),
      sponsorship_event: out.events.map((row) => row.id),
      sponsorship_token: tokens.map((row) => row.id),
    },
  };
}

/** One checkout: its sponsor, invoice request, payment and rows. */
function writeCheckout(
  context: Context,
  checkout: Checkout,
  n: number,
  mapped: ReadonlyMap<string, MappedStatus>,
  ids: Ids,
  out: Out
): void {
  const checkoutIds = ids.checkouts.get(checkout.key);
  if (!checkoutIds) {
    throw new Error(`[migrate-convex] No ids for checkout ${checkout.key}`);
  }
  writeSponsor(context, checkout, n, checkoutIds.sponsor, out);
  const paymentRow = paymentOf(context, checkout, mapped, checkoutIds.payment);
  if (paymentRow) {
    out.payments.push(paymentRow);
  }
  const place: RowPlace = {
    n,
    paymentId: paymentRow ? paymentRow.id : null,
    sponsorId: checkoutIds.sponsor,
  };
  for (const row of checkout.rows) {
    const status = mapped.get(row._id);
    if (status) {
      writeSponsorship(context, row, status, place, rowIdsOf(ids, row), out);
    }
  }
}

/** The first `mark_paid_manually` log of each sponsorship (logs come sorted). */
function manualMarksOf(
  logs: readonly AdminLogRow[]
): ReadonlyMap<string, AdminLogRow> {
  const marks = new Map<string, AdminLogRow>();
  for (const log of logs) {
    if (
      log.action === "mark_paid_manually" &&
      log.targetType === "sponsorship" &&
      !marks.has(log.targetId)
    ) {
      marks.set(log.targetId, log);
    }
  }
  return marks;
}

/** Ruling 10, applied to the export (see the module comment). */
export async function transformSponsorships(
  input: TransformContext
): Promise<SponsorshipTransformResult> {
  const context: Context = {
    counts: {},
    issues: new Issues(),
    manualMarks: manualMarksOf(input.data.adminLogs),
    muxMap: input.inputs.muxMap,
    now: input.now,
    overrides: input.inputs.overrides,
    p: pseudonymiser(input.target),
    users: new Set(input.data.users.map((row) => row._id)),
  };
  const all = input.data.sponsorships;
  checkUnknownOverrides(context, all);
  const rows = withGesture(
    context,
    all,
    new Set(input.data.gestures.map((row) => row._id))
  );
  const mapped = new Map(
    rows.map((row) => [
      row._id,
      mapSponsorshipStatus(
        row,
        context.now,
        trimmed(row.molliePaymentId) !== null
      ),
    ])
  );
  checkBlocking(context, rows, mapped);

  const checkouts = checkoutsOf(rows);
  const ids = await idsOf(checkouts);
  const out: Out = {
    events: [],
    invoiceRequests: [],
    paymentItems: [],
    payments: [],
    seenTokens: new Set(),
    sponsors: [],
    sponsorships: [],
    tokens: [],
  };
  for (const [index, checkout] of checkouts.entries()) {
    writeCheckout(context, checkout, index + 1, mapped, ids, out);
  }

  const tokens = [...context.p.tokens(out.tokens)];
  const counts: Record<string, number> = {
    ...context.counts,
    events: out.events.length,
    invoiceRequests: out.invoiceRequests.length,
    paymentItems: out.paymentItems.length,
    payments: out.payments.length,
    sponsors: out.sponsors.length,
    sponsorships: out.sponsorships.length,
  };
  return {
    group: "50-sponsorships",
    resetKeys: resetKeysOf(out, tokens),
    rows: {
      events: out.events,
      invoiceRequests: out.invoiceRequests,
      paymentItems: out.paymentItems,
      payments: out.payments,
      sponsors: out.sponsors,
      sponsorships: out.sponsorships,
      tokens,
    },
    sections: [section("sponsorships", counts, context.issues.list())],
    statements: statementsOf(out, tokens),
  };
}
