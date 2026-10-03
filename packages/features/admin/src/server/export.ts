import { invoiceRequest, sponsor, sponsorship } from "@smog/db";
import type { Db } from "@smog/db/client";
import { centsToMollieValue } from "@smog/payments";
import { DAY_MS } from "@smog/utils";
import { and, asc, count, eq, gt, gte, or, type SQL } from "drizzle-orm";
import {
  SPONSORSHIP_CSV_COLUMNS,
  SPONSORSHIP_EXPORT_PAGE,
  SPONSORSHIP_EXPORT_ROWS_MAX,
} from "../schema";
import { writeAudit } from "./audit-writer";
import { adminProcedure } from "./procedure";
import {
  checkoutItemSql,
  parseCheckoutItem,
  type SponsorshipPosition,
  sponsorshipFilters,
  statusFilter,
} from "./sponsorships";

/** A cell a spreadsheet would read as a formula (or a command) when it leads. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One CSV field: always quoted with `"` doubled (RFC 4180), and a cell that
 * starts with `=`, `+`, `-`, `@`, a tab or a CR gets a leading `'`, so a
 * spreadsheet shows it as text instead of running it (formula injection).
 */
export function csvCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const csvLine = (cells: readonly string[]): string =>
  `${cells.map(csvCell).join(",")}\r\n`;

const BRUSSELS_DATE = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Brussels",
  year: "numeric",
});

/** `sponsorships-YYYY-MM-DD.csv`, the date in Brussels. */
export function csvFilename(now: Date): string {
  return `sponsorships-${BRUSSELS_DATE.format(now)}.csv`;
}

/** After the position in `(created_at, id)` order (oldest first). */
function after(position: SponsorshipPosition): SQL | undefined {
  const at = new Date(position.createdAt);
  return and(
    gte(sponsorship.createdAt, at),
    or(gt(sponsorship.createdAt, at), gt(sponsorship.id, position.id))
  );
}

function exportPage(
  db: Db,
  filters: SQL | undefined,
  position: SponsorshipPosition | null
) {
  return db
    .select({
      checkout: checkoutItemSql,
      company: sponsor.company,
      createdAt: sponsorship.createdAt,
      displayName: sponsorship.displayName,
      email: sponsor.email,
      endsAt: sponsorship.endsAt,
      gestureId: sponsorship.gestureId,
      id: sponsorship.id,
      invoiceEmail: invoiceRequest.email,
      invoiceName: invoiceRequest.name,
      invoiceVat: invoiceRequest.vatNumber,
      logoKey: sponsorship.logoKey,
      name: sponsor.name,
      startsAt: sponsorship.startsAt,
      status: sponsorship.status,
    })
    .from(sponsorship)
    .innerJoin(sponsor, eq(sponsor.id, sponsorship.sponsorId))
    .leftJoin(invoiceRequest, eq(invoiceRequest.sponsorId, sponsor.id))
    .where(and(filters, position ? after(position) : undefined))
    .orderBy(asc(sponsorship.createdAt), asc(sponsorship.id))
    .limit(SPONSORSHIP_EXPORT_PAGE);
}

type ExportRow = Awaited<ReturnType<typeof exportPage>>[number];

const YEAR_MS = 365 * DAY_MS;
const iso = (date: Date | null): string => date?.toISOString() ?? "";
const yesNo = (value: boolean): string => (value ? "Yes" : "No");

/** One sponsorship's 18 cells, in `SPONSORSHIP_CSV_COLUMNS` order. */
function rowCells(row: ExportRow): string[] {
  const checkout = parseCheckoutItem(row.checkout);
  const years =
    row.startsAt && row.endsAt
      ? String(
          Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / YEAR_MS)
        )
      : "";
  return [
    row.id,
    row.status,
    row.displayName,
    row.email,
    row.name,
    row.company ?? "",
    row.invoiceName ?? "",
    row.invoiceVat ?? "",
    row.invoiceEmail ?? "",
    yesNo(row.invoiceName !== null),
    yesNo(checkout?.includesLogo ?? row.logoKey !== null),
    checkout ? centsToMollieValue(checkout.amountCents) : "",
    checkout?.mollieId ?? "",
    iso(row.startsAt),
    iso(row.endsAt),
    years,
    row.gestureId,
    iso(row.createdAt),
  ];
}

/** Over the cap: the admin narrows the date range. */
class TooManyRowsError extends Error {
  constructor(rows: number) {
    super(`[admin] The export has ${rows} rows, over the cap`);
    this.name = "TooManyRowsError";
  }
}

/**
 * The CSV, read in keyset pages of 500 (no 10,000 row cap, bug 11): one
 * page of rows is held at a time, serialised to text before the next is
 * read. Counted first, so an export over the cap reads no rows.
 */
async function buildCsv(
  db: Db,
  filters: SQL | undefined
): Promise<{ csv: string; rows: number }> {
  const [total] = await db
    .select({ n: count() })
    .from(sponsorship)
    .where(filters);
  if ((total?.n ?? 0) > SPONSORSHIP_EXPORT_ROWS_MAX) {
    throw new TooManyRowsError(total?.n ?? 0);
  }
  const chunks = [csvLine(SPONSORSHIP_CSV_COLUMNS)];
  let rows = 0;
  let position: SponsorshipPosition | null = null;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: keyset pages, each after the last.
    const page = await exportPage(db, filters, position);
    rows += page.length;
    if (rows > SPONSORSHIP_EXPORT_ROWS_MAX) {
      // Rows were added since the count.
      throw new TooManyRowsError(rows);
    }
    chunks.push(page.map((row) => csvLine(rowCells(row))).join(""));
    const last = page.at(-1);
    if (!last || page.length < SPONSORSHIP_EXPORT_PAGE) {
      break;
    }
    position = { createdAt: last.createdAt.getTime(), id: last.id };
  }
  return { csv: chunks.join(""), rows };
}

/** The `export` slice of the admin router (A-09, ruling 14). */
export function exportRoutes() {
  return {
    export: {
      sponsorshipsCsv: adminProcedure.export.sponsorshipsCsv.handler(
        async ({ context, errors, input }) => {
          const filters = and(
            sponsorshipFilters(input),
            statusFilter(input.status)
          );
          let built: { csv: string; rows: number };
          try {
            built = await buildCsv(context.db, filters);
          } catch (error) {
            if (error instanceof TooManyRowsError) {
              throw errors.INVALID_STATE({ data: { reason: "tooMany" } });
            }
            console.error("[admin] Failed to export the sponsorships:", error);
            throw error;
          }
          await writeAudit(context.db, {
            action: "export.sponsorships_csv",
            actorId: context.user.id,
            data: {
              filters: {
                ...(input.from === undefined ? {} : { from: input.from }),
                ...(input.status ? { status: input.status } : {}),
                ...(input.to === undefined ? {} : { to: input.to }),
              },
              rows: built.rows,
            },
            targetId: null,
            targetType: "system",
          });
          return { ...built, filename: csvFilename(new Date()) };
        }
      ),
    },
  };
}
